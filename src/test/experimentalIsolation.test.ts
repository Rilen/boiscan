import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function readText(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('isolamento da ferramenta experimental', () => {
  it('o app público não importa o pipeline experimental', () => {
    const publicSources = [
      'src/App.tsx',
      'src/main.tsx',
      'src/screens/HomeScreen.tsx',
      'src/screens/ReviewScreen.tsx',
      'src/screens/AnalyzingScreen.tsx',
      'src/screens/ResultScreen.tsx',
      'src/components/QualityPanel.tsx',
      'src/components/PhotoInput.tsx',
    ];
    for (const file of publicSources) {
      expect(readText(file)).not.toMatch(/from ['"][^'"]*experimental['"]/);
      expect(readText(file)).not.toMatch(/experimental\/tool|experimental\/engine/);
    }
  });

  it('a ferramenta é local, noindex e não está no HTML público', () => {
    const tool = readText('experimental/visual-tool.html');
    const publicHtml = readText('index.html');
    expect(tool).toContain('noindex, nofollow');
    expect(tool).toContain('/src/experimental/tool.ts');
    expect(publicHtml).not.toContain('experimental/visual-tool');
    expect(publicHtml).not.toContain('experimental/tool');
  });

  it('o comando de avaliação real está registrado', () => {
    const pkg = JSON.parse(readText('package.json')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['experimental:images']).toContain('real-images.ts');
  });
});
