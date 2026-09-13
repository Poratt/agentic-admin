import { Directive, ElementRef, input, OnChanges, Renderer2, inject, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

const HEBREW_ROLE_LABEL = 'תפקיד';
const HEBREW_ADMIN_LABEL = 'מנהל';
const HEBREW_USER_LABEL = 'משתמש';

@Directive({
  selector: '[aiFormat]',
  standalone: true,
})
export class AiFormat implements OnChanges {
  aiFormat = input<string>('');

  private el = inject<ElementRef<HTMLElement>>(ElementRef);
  private renderer = inject(Renderer2);
  private sanitizer = inject(DomSanitizer);

  private legacyBlocks: string[] = [];

  ngOnChanges() {
    const raw = this.aiFormat() ?? '';
    const prepped = this.sanitizeLegacyComponentBlocks(raw);
    const parsedHtml = this.parse(prepped);
    const restored = this.restoreLegacyComponentBlocks(parsedHtml);
    const safeHtml = this.sanitizer.sanitize(SecurityContext.HTML, restored) || '';
    this.updateDomEfficiently(safeHtml);
    this.markNewCompletedBlocks(raw);
  }

  private sanitizeLegacyComponentBlocks(text: string): string {
    const regex = /```component\s*([\s\S]*?)```/gi;
    this.legacyBlocks = [];
    if (!regex.test(text)) return text;

    return text.replace(regex, (_match, inner: string) => {
      const stripped = inner.replace(/<script[\s\S]*?<\/script>/gi, '');
      this.legacyBlocks.push(stripped.trim());
      return `LEGACY_BLOCK_${this.legacyBlocks.length - 1}_`;
    });
  }

  private restoreLegacyComponentBlocks(text: string): string {
    return text.replace(/LEGACY_BLOCK_(\d+)_/g, (_match, index: string) => {
      const content = this.legacyBlocks[Number(index)] ?? '';
      const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<blockquote class="legacy-component-block"><span class="legacy-component-label">Legacy Component</span>${escaped}</blockquote>`;
    });
  }

  private parse(text: string): string {
    const TABLE_PLACEHOLDER = 'TABLE_PLACEHOLDER_';
    const tables: string[] = [];

    const withTables = text.replace(/((?:^\|.+\|[ \t]*\n?)+)/gm, (block) => {
      tables.push(this.parseTable(block));
      return `${TABLE_PLACEHOLDER}${tables.length - 1}_`;
    });

    let processed = withTables
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<span class="ai-bold" >$1</span>')
      .replace(/^\* (.+)$/gm, '<li>$1</li>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/(<li>[\s\S]*?<\/li>)/g, (match) => {
        return `<ul>${match}</ul>`;
      })
      .replace(/^---$/gm, '<hr>')
      .replace(/\n/g, '<br>');

    processed = processed
      .replace(/(<br>\s*){2,}/gi, '<br><br>')
      .replace(/<br>\s*<(h1|h2|h3|hr|ul|li|table|thead|tbody|tr|div|pre)/gi, '<$1')
      .replace(/<\/(h1|h2|h3|hr|ul|li|table|thead|tbody|tr|div|pre)>\s*<br>/gi, '</$1>');

    processed = processed.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="ai-link">$1</a>',
    );

    processed = processed.replace(
      /(?<!["'=a])(https?:\/\/[^\s<>"')\]]+)/gi,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="ai-link">$1</a>',
    );

    processed = processed
      .replace(
        new RegExp(`(${HEBREW_ROLE_LABEL}|Role):\\s*(${HEBREW_ADMIN_LABEL}|Admin)`, 'g'),
        `$1: <span class="badge role-admin"><span class="ph sm">shield</span>${HEBREW_ADMIN_LABEL}</span>`
      )
      .replace(
        new RegExp(`(${HEBREW_ROLE_LABEL}|Role):\\s*(${HEBREW_USER_LABEL}|User)`, 'g'),
        `$1: <span class="badge badge-user"><span class="ph sm">person</span>${HEBREW_USER_LABEL}</span>`
      )
      .replace(
        new RegExp(`\\b(Admin|${HEBREW_ADMIN_LABEL})\\s*\\(ID:\\s*(\\d+)\\)`, 'gi'),
        `<span class="badge role-admin"><span class="ph sm">shield</span>${HEBREW_ADMIN_LABEL}</span> (ID: $2)`
      )
      .replace(
        new RegExp(`\\b(User|${HEBREW_USER_LABEL})\\s*\\(ID:\\s*(\\d+)\\)`, 'gi'),
        `<span class="badge badge-user"><span class="ph sm">person</span>${HEBREW_USER_LABEL}</span> (ID: $2)`
      );

    return processed.replace(new RegExp(`${TABLE_PLACEHOLDER}(\\d+)_`, 'g'), (_, i) => {
      return tables[+i];
    });
  }

  private parseTable(block: string): string {
    const lines = block
      .trim()
      .split('\n')
      .filter((l) => {
        return l.trim();
      });
    if (lines.length < 2) {
      return block;
    }

    const inlineMarkdown = (cellText: string): string => {
      return cellText
        .replace(/\*\*(.+?)\*\*/g, '<span class="ai-bold" >$1</span>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>');
    };

    const parseRow = (line: string): string[] => {
      return line
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => {
          return c.trim();
        });
    };

    const isSeparator = (line: string) => {
      return /^\|?[\s\-|: ]+\|?$/.test(line) && line.includes('-');
    };

    const headerCells = parseRow(lines[0]);
    const dataLines = lines.slice(1).filter((l) => {
      return !isSeparator(l);
    });

    const roleColIndex = headerCells.findIndex((h) => {
      const cleanH = h.replace(/\*/g, '').trim();
      return cleanH === HEBREW_ROLE_LABEL || cleanH.toLowerCase() === 'role';
    });

    const thead = `<thead><tr>${headerCells
      .map((h) => {
        return `<th><span class="ai-table-header">${inlineMarkdown(h)}</span></th>`;
      })
      .join('')}</tr></thead>`;

    const tbody = `<tbody>${dataLines
      .map((line) => {
        const cells = parseRow(line);
        const tds = cells
          .map((c, i) => {
            const formattedContent = inlineMarkdown(c);

            if (i === roleColIndex) {
              const cleanTextForBadge = c.replace(/\*/g, '').trim();
              return `<td>${this.roleBadge(cleanTextForBadge)}</td>`;
            }

            return `<td>${formattedContent}</td>`;
          })
          .join('');
        return `<tr>${tds}</tr>`;
      })
      .join('')}</tbody>`;

    return `<div class="ai-table-wrap"><table class="ai-table">${thead}${tbody}</table></div>`;
  }

  private roleBadge(text: string): string {
    const t = text.trim();
    if (t === HEBREW_ADMIN_LABEL || t.toLowerCase() === 'admin') {
      return `<span class="badge role-admin"><span class="ph sm">shield</span>${HEBREW_ADMIN_LABEL}</span>`;
    }
    if (t === HEBREW_USER_LABEL || t.toLowerCase() === 'user') {
      return `<span class="badge badge-user"><span class="ph sm">person</span>${HEBREW_USER_LABEL}</span>`;
    }
    return `<span>${t}</span>`;
  }

  private markNewCompletedBlocks(raw: string): void {
    const blocks = Array.from(this.el.nativeElement.children) as HTMLElement[];
    if (blocks.length === 0) return;

    const lastBlock = blocks[blocks.length - 1];
    const lastBlockIsStable = this.isLastBlockStable(raw);

    blocks.forEach((block) => {
      if (block.hasAttribute('data-ai-animated')) return;

      const isLast = block === lastBlock;
      if (isLast && !lastBlockIsStable) return;

      block.setAttribute('data-ai-animated', '1');
      this.renderer.addClass(block, 'ai-node-fade-in');
    });
  }

  private isLastBlockStable(raw: string): boolean {
    return /\n\s*\n$/.test(raw) || /```[\s\S]*?```\s*$/.test(raw) || /\|.+\|\s*$/.test(raw);
  }

  private updateDomEfficiently(htmlContent: string): void {
    const target = this.el.nativeElement;

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const newNodes = Array.from(doc.body.childNodes);
    const currentNodes = Array.from(target.childNodes);

    const maxLen = Math.max(currentNodes.length, newNodes.length);
    for (let i = 0; i < maxLen; i++) {
      const current = currentNodes[i];
      const next = newNodes[i];

      if (!current && next) {
        this.renderer.appendChild(target, next.cloneNode(true));
        continue;
      }

      if (current && !next) {
        this.renderer.removeChild(target, current);
        continue;
      }

      this.morphNode(current, next);
    }
  }

  private morphNode(current: ChildNode, newNode: ChildNode): void {
    if (current.nodeType !== newNode.nodeType) {
      const parent = current.parentNode!;
      const clone = newNode.cloneNode(true);
      this.renderer.insertBefore(parent, clone, current);
      this.renderer.removeChild(parent, current);
      return;
    }

    if (current.nodeType === Node.TEXT_NODE) {
      if (current.textContent !== newNode.textContent) {
        current.textContent = newNode.textContent;
      }
      return;
    }

    if (!(current instanceof HTMLElement) || !(newNode instanceof HTMLElement)) return;

    if (current.tagName !== newNode.tagName) {
      const parent = current.parentNode!;
      const clone = newNode.cloneNode(true);
      this.renderer.insertBefore(parent, clone, current);
      this.renderer.removeChild(parent, current);
      return;
    }

    this.morphAttributes(current, newNode);
    this.morphChildren(current, newNode);
  }

  private morphAttributes(current: HTMLElement, newNode: HTMLElement): void {
    const currentAttrs = Array.from(current.attributes);
    const newAttrs = Array.from(newNode.attributes);

    for (const attr of newAttrs) {
      if (current.getAttribute(attr.name) !== attr.value) {
        this.renderer.setAttribute(current, attr.name, attr.value);
      }
    }

    for (const attr of currentAttrs) {
      if (!newNode.hasAttribute(attr.name)) {
        this.renderer.removeAttribute(current, attr.name);
      }
    }
  }

  private morphChildren(current: HTMLElement, newNode: HTMLElement): void {
    const currentChildren = Array.from(current.childNodes);
    const newChildren = Array.from(newNode.childNodes);

    const maxLen = Math.max(currentChildren.length, newChildren.length);
    for (let i = 0; i < maxLen; i++) {
      const cur = currentChildren[i];
      const nxt = newChildren[i];

      if (!cur && nxt) {
        this.renderer.appendChild(current, nxt.cloneNode(true));
        continue;
      }

      if (cur && !nxt) {
        this.renderer.removeChild(current, cur);
        continue;
      }

      this.morphNode(cur, nxt);
    }
  }
}
