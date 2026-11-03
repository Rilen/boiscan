import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function readText(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

function pngSize(path: string): { width: number; height: number } {
  const buffer = readFileSync(resolve(root, path));
  expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

describe('preparação Android / Google Play', () => {
  it('mantém package ID e versão estáveis nos templates', () => {
    const manifest = JSON.parse(
      readText('android/twa-manifest.example.json'),
    ) as {
      packageId: string;
      appVersion: string;
      appVersionCode: number;
      host: string;
      name: string;
      signingKey: { path: string; alias: string };
      fingerprints: unknown[];
    };

    expect(manifest.packageId).toBe('br.com.boiscan.app');
    expect(manifest.name).toBe('BoiScan');
    expect(manifest.appVersion).toBe('0.2.0');
    expect(manifest.appVersionCode).toBe(1);
    expect(manifest.host).toBe('<PUBLIC_HOST>');
    expect(manifest.signingKey.path).toContain('<ABSOLUTE_PATH');
    expect(manifest.fingerprints).toEqual([]);
  });

  it('digital asset links usa o mesmo package ID e placeholder de certificado', () => {
    const statements = JSON.parse(
      readText('android/assetlinks.example.json'),
    ) as Array<{
      relation: string[];
      target: { package_name: string; sha256_cert_fingerprints: string[] };
    }>;

    expect(statements).toHaveLength(1);
    expect(statements[0]?.target.package_name).toBe('br.com.boiscan.app');
    expect(statements[0]?.relation).toContain(
      'delegate_permission/common.handle_all_urls',
    );
    expect(statements[0]?.target.sha256_cert_fingerprints[0]).toBe(
      '<SHA256_CERT_FINGERPRINT>',
    );
  });

  it('documenta target API 36 e os bloqueios de publicação', () => {
    const readme = readText('android/README.md');
    const checklist = readText('android/CHECKLIST.md');

    expect(readme).toMatch(/targetSdkVersion\s+36|targetSdk.*36/);
    expect(readme).toMatch(/API 36/);
    expect(readme).toMatch(/modelo de peso validado/i);
    expect(readme).toMatch(/JDK 17/);
    expect(checklist).toContain('12');
    expect(checklist).toContain('14 dias');
    expect(checklist).toContain('Data safety');
    expect(checklist).toMatch(/abrir produção/i);
  });

  it('não inclui keystore, chave privada ou senha no repositório', () => {
    const androidFiles = readdirSync(resolve(root, 'android'));
    expect(androidFiles.some((file) => /\.(jks|keystore)$/i.test(file))).toBe(false);

    for (const file of androidFiles) {
      if (!file.endsWith('.md') && !file.endsWith('.json')) continue;
      const content = readText(`android/${file}`);
      expect(content).not.toMatch(/-----BEGIN (RSA |EC )?PRIVATE KEY-----/);
      expect(content).not.toMatch(/storePassword|keyPassword/);
    }
  });

  it('package web e Android compartilham a identidade BoiScan 0.2.0', () => {
    const pkg = JSON.parse(readText('package.json')) as {
      name: string;
      version: string;
    };
    const config = readText('src/config.ts');
    const manifest = JSON.parse(
      readText('public/manifest.webmanifest'),
    ) as { name: string; short_name: string };

    expect(pkg.name).toBe('boiscan');
    expect(pkg.version).toBe('0.2.0');
    expect(config).toContain("APP_NAME = 'BoiScan'");
    expect(config).toContain("APP_VERSION = '0.2.0'");
    expect(config).toContain("ANDROID_PACKAGE_ID = 'br.com.boiscan.app'");
    expect(manifest.name).toContain('BoiScan');
    expect(manifest.short_name).toBe('BoiScan');
  });

  it('ícones PWA têm as dimensões exigidas', () => {
    expect(pngSize('public/icons/icon-192.png')).toEqual({
      width: 192,
      height: 192,
    });
    expect(pngSize('public/icons/icon-512.png')).toEqual({
      width: 512,
      height: 512,
    });
  });
});
