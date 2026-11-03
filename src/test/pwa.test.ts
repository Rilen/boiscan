import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readText(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('compatibilidade PWA', () => {
  it('declara manifesto com identidade, idioma e ícones', () => {
    const manifest = JSON.parse(readText('public/manifest.webmanifest')) as {
      id: string;
      name: string;
      short_name: string;
      lang: string;
      start_url: string;
      scope: string;
      display: string;
      theme_color: string;
      icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
    };

    expect(manifest.id).toBe('/');
    expect(manifest.name).toContain('BoiScan');
    expect(manifest.short_name).toBe('BoiScan');
    expect(manifest.lang).toBe('pt-BR');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: '/icons/icon-192.png', sizes: '192x192' }),
        expect.objectContaining({ src: '/icons/icon-512.png', sizes: '512x512' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
      ]),
    );
  });

  it('vincula manifesto, identidade e ícones no HTML', () => {
    const html = readText('index.html');
    expect(html).toContain('lang="pt-BR"');
    expect(html).toContain('BoiScan');
    expect(html).toContain('name="application-name"');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('/manifest.webmanifest');
    expect(html).toContain('apple-touch-icon');
    expect(html).toContain('viewport-fit=cover');
  });

  it('service worker mantém shell offline e não intercepta a API', () => {
    const sw = readText('public/sw.js');
    expect(sw).toContain("const CACHE_NAME = 'boiscan-shell-v1'");
    expect(sw).toContain("'/privacidade.html'");
    expect(sw).toContain("request.mode === 'navigate'");
    expect(sw).toContain("url.pathname.startsWith('/v1/')");
    expect(sw).not.toMatch(/https?:\/\/(?!self)/);
  });

  it('publica política de privacidade estática e sem scripts de rastreamento', () => {
    const privacy = readText('public/privacidade.html');
    expect(privacy).toContain('Política de Privacidade');
    expect(privacy).toContain('BoiScan');
    expect(privacy).toContain('Lei Geral de Proteção de Dados');
    expect(privacy).not.toMatch(/<script/i);
    expect(privacy).not.toMatch(/google-analytics|googletagmanager|gtag\(/i);
  });
});
