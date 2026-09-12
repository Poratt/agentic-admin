import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { IdeasTasksService } from './ideas-tasks.service';
import { IdeasService } from './ideas.service';
import { UsersService } from '../users/users.service';
import { LlmProviderService } from '../llm-provider/llm-provider.service';
import { LlmProviderConfigService } from '../llm/services/llm-provider-config.service';
import { TelegramNotifyService } from './telegram-notify.service';
import { User } from '../users/entities/user.entity';
import { translationTracker } from '../../core/services/translation-tracker';

function makeAdmin(): User {
  return { id: 1, role: 1 as any } as User;
}

function makeGroundedResult(domain: string, score = 7) {
  return {
    topic: { domain, searchQuery: `${domain} search`, rationale: `pain point for ${domain}` },
    response: {
      success: true,
      message: 'ok',
      partial: false,
      result: [{
        title: `${domain} idea`,
        description: 'd',
        targetMarket: 'm',
        validationScore: score,
        validationReason: 'r',
        risks: [],
        competitors: [],
        nextSteps: [],
        signalsReferenced: [],
        groundedInSignals: true,
      }],
    },
  };
}

describe('IdeasTasksService — nightly cron (Phase 3 + discovery + hard gate)', () => {
  let service: IdeasTasksService;
  let ideasService: jest.Mocked<
    Pick<IdeasService, 'generateIdeas' | 'saveGeneration' | 'discoverTopics' | 'generateGroundedIdeasForCron'>
  >;
  let usersService: jest.Mocked<Pick<UsersService, 'findFirstAdmin'>>;
  let llmProviderService: jest.Mocked<Pick<LlmProviderService, 'findFirstActiveTextModel'>>;
  let telegramNotifyService: jest.Mocked<Pick<TelegramNotifyService, 'sendMessage' | 'isEnabled'>>;

  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env = { ...originalEnv };
    translationTracker.reset();
    delete process.env.IDEAS_NIGHTLY_ENABLED;
    delete process.env.IDEAS_NIGHTLY_COUNT;
    delete process.env.IDEAS_NIGHTLY_TOPIC_COUNT;
    delete process.env.IDEAS_NIGHTLY_MODEL;

    ideasService = {
      generateIdeas: jest.fn(),
      saveGeneration: jest.fn(),
      discoverTopics: jest.fn(),
      generateGroundedIdeasForCron: jest.fn(),
    };
    usersService = {
      findFirstAdmin: jest.fn(),
    };
    llmProviderService = {
      findFirstActiveTextModel: jest.fn(),
    };
    telegramNotifyService = {
      sendMessage: jest.fn().mockResolvedValue(true),
      isEnabled: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdeasTasksService,
        { provide: IdeasService, useValue: ideasService },
        { provide: UsersService, useValue: usersService },
        { provide: LlmProviderService, useValue: llmProviderService },
        { provide: LlmProviderConfigService, useValue: { getActiveProvider: jest.fn(), getActiveModel: jest.fn() } },
        { provide: TelegramNotifyService, useValue: telegramNotifyService },
      ],
    }).compile();

    service = module.get(IdeasTasksService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('no-ops when IDEAS_NIGHTLY_ENABLED is not exactly "true"', async () => {
    process.env.IDEAS_NIGHTLY_ENABLED = 'false';

    await service.runNightly();

    expect(usersService.findFirstAdmin).not.toHaveBeenCalled();
    expect(ideasService.discoverTopics).not.toHaveBeenCalled();
    expect(ideasService.generateGroundedIdeasForCron).not.toHaveBeenCalled();
    expect(ideasService.generateIdeas).not.toHaveBeenCalled();
    expect(ideasService.saveGeneration).not.toHaveBeenCalled();
  });

  it('skips when grounded cron returns 0 results', async () => {
    process.env.IDEAS_NIGHTLY_ENABLED = 'true';

    usersService.findFirstAdmin.mockResolvedValue(makeAdmin());
    llmProviderService.findFirstActiveTextModel.mockResolvedValue({ provider: 'openrouter', model: 'gpt-4o' });
    ideasService.generateGroundedIdeasForCron.mockResolvedValue([]);
    telegramNotifyService.isEnabled.mockReturnValue(false); // Telegram off — no empty-run message

    await service.runNightly();

    expect(ideasService.saveGeneration).not.toHaveBeenCalled();
    expect(telegramNotifyService.sendMessage).not.toHaveBeenCalled();
  });

  it('sends a Telegram message when the run ends empty AND Telegram is enabled (no silent dead runs)', async () => {
    process.env.IDEAS_NIGHTLY_ENABLED = 'true';
    process.env.IDEAS_NIGHTLY_MODEL = '';

    usersService.findFirstAdmin.mockResolvedValue(makeAdmin());
    llmProviderService.findFirstActiveTextModel.mockResolvedValue({ provider: 'openrouter', model: 'gpt-4o' });
    ideasService.generateGroundedIdeasForCron.mockResolvedValue([]);
    telegramNotifyService.isEnabled.mockReturnValue(true);

    await service.runNightly();

    expect(ideasService.saveGeneration).not.toHaveBeenCalled();
    expect(telegramNotifyService.sendMessage).toHaveBeenCalledTimes(1);
    expect(telegramNotifyService.sendMessage.mock.calls[0][0]).toContain('בלי רעיונות grounded');
  });

  it('carries the translation-harvest block on an empty run when the tracker holds records', async () => {
    process.env.IDEAS_NIGHTLY_ENABLED = 'true';
    process.env.IDEAS_NIGHTLY_MODEL = '';
    translationTracker.recordGeneticsMiss('אוראוז', 'Oreoz');

    usersService.findFirstAdmin.mockResolvedValue(makeAdmin());
    llmProviderService.findFirstActiveTextModel.mockResolvedValue({ provider: 'openrouter', model: 'gpt-4o' });
    ideasService.generateGroundedIdeasForCron.mockResolvedValue([]);
    telegramNotifyService.isEnabled.mockReturnValue(true);

    await service.runNightly();

    expect(telegramNotifyService.sendMessage).toHaveBeenCalledTimes(1);
    const [message] = telegramNotifyService.sendMessage.mock.calls[0];
    expect(message).toContain('בלי רעיונות grounded');
    expect(message).toContain('אוראוז→Oreoz');
  });

  it('does NOT send a Telegram message on an empty run when Telegram is disabled', async () => {
    process.env.IDEAS_NIGHTLY_ENABLED = 'true';
    process.env.IDEAS_NIGHTLY_MODEL = '';

    usersService.findFirstAdmin.mockResolvedValue(makeAdmin());
    llmProviderService.findFirstActiveTextModel.mockResolvedValue({ provider: 'openrouter', model: 'gpt-4o' });
    ideasService.generateGroundedIdeasForCron.mockResolvedValue([]);
    telegramNotifyService.isEnabled.mockReturnValue(false);

    await service.runNightly();

    expect(ideasService.saveGeneration).not.toHaveBeenCalled();
    expect(telegramNotifyService.sendMessage).not.toHaveBeenCalled();
  });

  it('calls generateGroundedIdeasForCron then saves each grounded result', async () => {
    process.env.IDEAS_NIGHTLY_ENABLED = 'true';
    process.env.IDEAS_NIGHTLY_MODEL = '';

    usersService.findFirstAdmin.mockResolvedValue(makeAdmin());
    llmProviderService.findFirstActiveTextModel.mockResolvedValue({ provider: 'openrouter', model: 'gpt-4o' });
    ideasService.generateGroundedIdeasForCron.mockResolvedValue([
      makeGroundedResult('ניהול חשבוניות לפרילנסרים', 7),
      makeGroundedResult('אנליטיקה למפתחים', 5),
    ]);
    ideasService.saveGeneration.mockResolvedValue(1);

    await service.runNightly();

    expect(ideasService.discoverTopics).not.toHaveBeenCalled();
    expect(ideasService.generateIdeas).not.toHaveBeenCalled();
    expect(ideasService.generateGroundedIdeasForCron).toHaveBeenCalledTimes(1);
    expect(ideasService.generateGroundedIdeasForCron).toHaveBeenCalledWith(5, 1, 'openrouter', 'gpt-4o');
    expect(ideasService.saveGeneration).toHaveBeenCalledTimes(2);

    const calls = (ideasService.saveGeneration as jest.Mock).mock.calls;
    expect(calls[0][1]).toBe('ניהול חשבוניות לפרילנסרים');
    expect(calls[1][1]).toBe('אנליטיקה למפתחים');
    for (const call of calls) {
      expect(call[0]).toBe(1); // admin.id
      expect(call[5]).toEqual({ nightly: true, unread: true });
    }
  });

  it('pushes a Telegram summary of the grounded ideas when the run finishes', async () => {
    process.env.IDEAS_NIGHTLY_ENABLED = 'true';
    process.env.IDEAS_NIGHTLY_MODEL = '';

    usersService.findFirstAdmin.mockResolvedValue(makeAdmin());
    llmProviderService.findFirstActiveTextModel.mockResolvedValue({ provider: 'openrouter', model: 'gpt-4o' });
    ideasService.generateGroundedIdeasForCron.mockResolvedValue([
      makeGroundedResult('ניהול חשבוניות', 7),
      makeGroundedResult('אנליטיקה למפתחים', 5),
    ]);
    ideasService.saveGeneration.mockResolvedValue(1);

    await service.runNightly();

    expect(telegramNotifyService.sendMessage).toHaveBeenCalledTimes(1);
    const [message] = telegramNotifyService.sendMessage.mock.calls[0];
    expect(message).toContain('ריצת הלילה הסתיימה — <b>2 נושאים, 2 רעיונות חדשים</b>');
    expect(message).toContain('📌 <b>ניהול חשבוניות</b>');
    expect(message).toContain('📌 <b>אנליטיקה למפתחים</b>');
    expect(message).toContain('ניהול חשבוניות idea — 7/10');
  });

  it('logs an explicit failure line when Telegram is enabled but the push fails', async () => {
    process.env.IDEAS_NIGHTLY_ENABLED = 'true';
    process.env.IDEAS_NIGHTLY_MODEL = '';

    usersService.findFirstAdmin.mockResolvedValue(makeAdmin());
    llmProviderService.findFirstActiveTextModel.mockResolvedValue({ provider: 'openrouter', model: 'gpt-4o' });
    ideasService.generateGroundedIdeasForCron.mockResolvedValue([makeGroundedResult('נושא', 7)]);
    ideasService.saveGeneration.mockResolvedValue(1);
    telegramNotifyService.isEnabled.mockReturnValue(true);
    telegramNotifyService.sendMessage.mockResolvedValue(false);

    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    await service.runNightly();

    // "The run succeeded, the notification failed" — the run's success must not look like a
    // silent failure, and the notification failure must not look like a run
    // failure.
    const tgWarn = warnSpy.mock.calls.find((args) => String(args[0]).includes('Telegram'));
    expect(tgWarn).toBeDefined();
    expect(String(tgWarn?.[0])).toContain('succeeded, but the Telegram notification failed');
    warnSpy.mockRestore();
  });

  it('does not log a Telegram failure line when Telegram is not configured', async () => {
    process.env.IDEAS_NIGHTLY_ENABLED = 'true';
    process.env.IDEAS_NIGHTLY_MODEL = '';

    usersService.findFirstAdmin.mockResolvedValue(makeAdmin());
    llmProviderService.findFirstActiveTextModel.mockResolvedValue({ provider: 'openrouter', model: 'gpt-4o' });
    ideasService.generateGroundedIdeasForCron.mockResolvedValue([makeGroundedResult('נושא', 7)]);
    ideasService.saveGeneration.mockResolvedValue(1);
    telegramNotifyService.isEnabled.mockReturnValue(false);
    telegramNotifyService.sendMessage.mockResolvedValue(false);

    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    await service.runNightly();

    const tgWarn = warnSpy.mock.calls.find((args) => String(args[0]).includes('Telegram'));
    expect(tgWarn).toBeUndefined();
    warnSpy.mockRestore();
  });

  it('uses IDEAS_NIGHTLY_MODEL env override when present', async () => {
    process.env.IDEAS_NIGHTLY_ENABLED = 'true';
    process.env.IDEAS_NIGHTLY_MODEL = 'agnes-ai/agnes-text-2.0';

    usersService.findFirstAdmin.mockResolvedValue(makeAdmin());
    ideasService.generateGroundedIdeasForCron.mockResolvedValue([
      makeGroundedResult('כלי AI', 6),
    ]);
    ideasService.saveGeneration.mockResolvedValue(1);

    await service.runNightly();

    expect(llmProviderService.findFirstActiveTextModel).not.toHaveBeenCalled();
    expect(ideasService.generateGroundedIdeasForCron).toHaveBeenCalledWith(5, 1, 'agnes-ai', 'agnes-text-2.0');
    expect(ideasService.saveGeneration).toHaveBeenCalledWith(
      1,
      'כלי AI',
      'agnes-ai',
      'agnes-text-2.0',
      expect.objectContaining({ success: true }),
      { nightly: true, unread: true },
    );
  });

  it('uses IDEAS_NIGHTLY_COUNT env override as target grounded count', async () => {
    process.env.IDEAS_NIGHTLY_ENABLED = 'true';
    process.env.IDEAS_NIGHTLY_COUNT = '8';
    process.env.IDEAS_NIGHTLY_MODEL = '';

    usersService.findFirstAdmin.mockResolvedValue(makeAdmin());
    llmProviderService.findFirstActiveTextModel.mockResolvedValue({ provider: 'openrouter', model: 'gpt-4o' });
    ideasService.generateGroundedIdeasForCron.mockResolvedValue([]);

    await service.runNightly();

    expect(ideasService.generateGroundedIdeasForCron).toHaveBeenCalledWith(8, 1, 'openrouter', 'gpt-4o');
  });

  it('isolates per-topic save failures — one failing save does not abort the rest', async () => {
    process.env.IDEAS_NIGHTLY_ENABLED = 'true';
    process.env.IDEAS_NIGHTLY_MODEL = '';

    usersService.findFirstAdmin.mockResolvedValue(makeAdmin());
    llmProviderService.findFirstActiveTextModel.mockResolvedValue({ provider: 'openrouter', model: 'gpt-4o' });
    ideasService.generateGroundedIdeasForCron.mockResolvedValue([
      makeGroundedResult('topic-a', 6),
      makeGroundedResult('topic-b', 7),
      makeGroundedResult('topic-c', 5),
    ]);
    ideasService.saveGeneration
      .mockRejectedValueOnce(new Error('DB write failed'))
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);

    await service.runNightly();

    // All 3 grounded results reached saveGeneration; one failed (caught),
    // the other two succeeded.
    expect(ideasService.saveGeneration).toHaveBeenCalledTimes(3);
    expect((ideasService.saveGeneration as jest.Mock).mock.calls[0][1]).toBe('topic-a');
    expect((ideasService.saveGeneration as jest.Mock).mock.calls[1][1]).toBe('topic-b');
    expect((ideasService.saveGeneration as jest.Mock).mock.calls[2][1]).toBe('topic-c');
  });
});
