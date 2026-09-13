import { AiFormat } from './ai-format.directive';

describe('AiFormat', () => {
  const directive = Object.create(AiFormat.prototype) as {
    parse(markdown: string): string;
  };

  it('renders css code fences as markdown code blocks', () => {
    const markdownHtml = directive.parse('```css\n.card { color: red; }\n```');

    expect(markdownHtml).toContain('<pre><code>');
    expect(markdownHtml).toContain('css');
    expect(markdownHtml).toContain('.card');
  });

  it('renders role badges for Hebrew and English role text', () => {
    const hebrewTableHtml = directive.parse('| שם | תפקיד |\n| --- | --- |\n| דנה | מנהל |\n| יוסי | משתמש |');
    const englishRoleHtml = directive.parse('Role: Admin\nUser (ID: 7)');

    expect(hebrewTableHtml).toContain('role-admin');
    expect(hebrewTableHtml).toContain('badge-user');
    expect(hebrewTableHtml).toContain('מנהל');
    expect(hebrewTableHtml).toContain('משתמש');
    expect(englishRoleHtml).toContain('role-admin');
    expect(englishRoleHtml).toContain('badge-user');
  });
});
