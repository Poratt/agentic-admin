import { LessThan, FindOperator } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { LlmProviderService } from './llm-provider.service';

function makeService(mockDelete: jest.Mock): LlmProviderService {
  const svc = new LlmProviderService({} as any, {} as any, { delete: mockDelete } as any, {} as any);
  return svc;
}

describe('LlmProviderService.deleteOldTestResults', () => {
  it('calls repository delete with a LessThan operator on createdAt', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ affected: 5 });
    const svc = makeService(mockDelete);

    const deleted = await svc.deleteOldTestResults(30);

    expect(deleted).toBe(5);
    const callArg = mockDelete.mock.calls[0][0];
    expect(callArg.createdAt).toBeDefined();
    expect(callArg.createdAt).toBeInstanceOf(FindOperator);
    const lessThan = callArg.createdAt as FindOperator<Date>;
    expect(lessThan.value).toBeInstanceOf(Date);
  });

  it('sets cutoff to now minus retentionDays', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ affected: 0 });
    const svc = makeService(mockDelete);

    await svc.deleteOldTestResults(30);

    const callArg = mockDelete.mock.calls[0][0];
    const lessThan = callArg.createdAt as FindOperator<Date>;
    const cutoff = lessThan.value as Date;
    const now = new Date();
    const diffMs = now.getTime() - cutoff.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(29.9);
    expect(diffDays).toBeLessThanOrEqual(30.1);
  });

  it('returns the affected row count from delete', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ affected: 7 });
    const svc = makeService(mockDelete);

    const deleted = await svc.deleteOldTestResults(30);

    expect(deleted).toBe(7);
  });

  it('returns 0 when DeleteResult has no affected count', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ affected: undefined });
    const svc = makeService(mockDelete);

    const deleted = await svc.deleteOldTestResults(30);

    expect(deleted).toBe(0);
  });

  it('uses custom retention value when provided', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ affected: 2 });
    const svc = makeService(mockDelete);

    await svc.deleteOldTestResults(7);

    const callArg = mockDelete.mock.calls[0][0];
    const lessThan = callArg.createdAt as FindOperator<Date>;
    const cutoff = lessThan.value as Date;
    const now = new Date();
    const diffDays = (now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(6.9);
    expect(diffDays).toBeLessThanOrEqual(7.1);
  });
});

describe('LlmProviderService.deleteProvider', () => {
  function makeDeleteService(providerRepo: { findOneBy: jest.Mock; delete: jest.Mock }): LlmProviderService {
    return new LlmProviderService(providerRepo as any, {} as any, {} as any, {} as any);
  }

  it('deletes the provider row and returns success', async () => {
    const providerRepo = {
      findOneBy: jest.fn().mockResolvedValue({ id: 3, key: 'openrouter' }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const svc = makeDeleteService(providerRepo);

    const res = await svc.deleteProvider(3);

    expect(providerRepo.findOneBy).toHaveBeenCalledWith({ id: 3 });
    expect(providerRepo.delete).toHaveBeenCalledWith({ id: 3 });
    expect(res.success).toBe(true);
    expect(res.message).toBe('Provider deleted');
  });

  it('throws NotFoundException for an unknown provider', async () => {
    const providerRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
    };
    const svc = makeDeleteService(providerRepo);

    await expect(svc.deleteProvider(99)).rejects.toThrow(NotFoundException);
    expect(providerRepo.delete).not.toHaveBeenCalled();
  });
});
