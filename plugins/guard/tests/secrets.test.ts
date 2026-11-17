import { expect, test } from 'claude-code/testing'

import { entropy, findSecrets, isEnvFile, pathAllowed } from '../hooks/secrets'
import { KIND_OF, fakes, rng } from './fakes'

const kinds = (text: string, path?: string, inCommand = false) => findSecrets(text, path, inCommand).map(h => h.kind)

for (const seed of [1, 2, 3]) {
  for (const [name, value] of Object.entries(fakes(seed))) {
    test(`finds a ${name} (seed ${seed}) in a file, a JSON value and a command`, () => {
      expect(kinds(`const key = "${value}"\n`, 'src/config.ts')).toContain(KIND_OF[name] as string)
      expect(kinds(JSON.stringify({ key: value }), 'config.json')).toContain(KIND_OF[name] as string)
      expect(kinds(`curl -H "Authorization: Bearer ${value}" https://api.test`, undefined, true)).toContain(KIND_OF[name] as string)
    })
  }
}

test('a hit says the kind and the line, never the value', () => {
  const f = fakes(9)
  const hits = findSecrets(`a\nb\nTOKEN="${f.github}"\n`, 'x.ts')
  expect(hits).toEqual([{ kind: 'github', line: 3 }])
  expect(JSON.stringify(hits)).not.toContain(f.github?.slice(4, 12) ?? 'x')
})

test('a private key inside a JSON service-account file', () => {
  const r = rng(5)
  const body = r(64, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/')
  const json = `{"type":"service_account","private_key":"-----BEGIN ` + `PRIVATE KEY-----\\n${body}\\n${body}\\n-----END PRIVATE KEY-----\\n"}`
  expect(kinds(json, 'sa.json')).toEqual(['privateKey'])
})

test('.env values with a secret-looking name are caught in .env files', () => {
  const r = rng(11)
  const env = `# app\nDEBUG=true\nPORT=8080\nDATABASE_PASSWORD=${r(20)}\nSTRIPE_WEBHOOK_SECRET="${r(32)}"\nAPI_URL=https://api.test\n`
  expect(findSecrets(env, '.env')).toEqual([
    { kind: 'envValue', line: 4 },
    { kind: 'envValue', line: 5 },
  ])
  expect(kinds(env, 'config/.env.production')).toEqual(['envValue', 'envValue'])
  expect(kinds(env, 'C:\\proj\\.env.local')).toEqual(['envValue', 'envValue'])
})

test('.env templates and empty or placeholder values pass', () => {
  const r = rng(12)
  const env = `API_KEY=${r(32)}\n`
  for (const p of ['.env.example', '.env.sample', '.env.template', 'env.example', '.env.dist']) expect([p, kinds(env, p)]).toEqual([p, []])
  const quiet = 'API_KEY=\nSECRET_KEY=changeme\nTOKEN=<your-token>\nPASSWORD=${DB_PASSWORD}\nAUTH_TOKEN=xxxxxxxxxxxxxxxx\nJWT_SECRET=your_jwt_secret_here\nACCESS_KEY=true\n'
  expect(kinds(quiet, '.env')).toEqual([])
})

test('a secret-looking assignment in a shell command is caught, a variable is not', () => {
  const r = rng(13)
  expect(kinds(`export OPENAI_API_KEY=${r(40)} && npm start`, undefined, true)).toEqual(['envValue'])
  expect(kinds(`echo "API_TOKEN=${r(40)}" >> .env`, undefined, true)).toEqual(['envValue'])
  expect(kinds('export OPENAI_API_KEY=$OPENAI_API_KEY', undefined, true)).toEqual([])
  expect(kinds('GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }} gh pr list', undefined, true)).toEqual([])
  expect(kinds('PASSWORD=short ./run', undefined, true)).toEqual([])
})

// The false positives a guard must not raise.
const QUIET: [string, string?][] = [
  ['sk-test-123'],
  ['const key = "sk-test-abcdefghijklmnopqrstuvwxyz0123456789"'],
  ['stripe.setKey("sk_test_' + rng(1)(30) + '")'],
  ['pk_live_' + rng(2)(30)],
  ['AKIAIOSFODNN7EXAMPLE'],
  ['aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'],
  ['gh' + 'p_' + 'x'.repeat(36)],
  ['gh' + 'p_' + '0123456789abcdefghijklmnopqrstuvwxyz'],
  ['gh' + 'p_' + 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'],
  ['sk-' + 'ant-api03-' + 'A'.repeat(93)],
  ['token: <your-api-key>'],
  ['Authorization: Bearer ${TOKEN}'],
  ['const t = process.env.GITHUB_TOKEN'],
  ['postgres://postgres:postgres@localhost:5432/db'],
  ['mysql://root:password@127.0.0.1/app'],
  ['https://user:${PASSWORD}@host.test/x'],
  ['redis://:changeme@redis:6379'],
  ['amqp://guest:guest@rabbit:5672'],
  ['https://user:pass@example.test'],
  ['git clone https://github.com/owner/repo.git'],
  // jwt.io's sample token, in countless docs.
  ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'],
  ['-----BEGIN ' + 'PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'],
  ['-----BEGIN ' + 'RSA PRIVATE KEY-----\n<paste your key here>\n-----END RSA PRIVATE KEY-----'],
  ['-----BEGIN PUBLIC KEY-----\n' + rng(3)(64) + '\n-----END PUBLIC KEY-----'],
  ['sha256: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'],
  ['uuid 123e4567-e89b-12d3-a456-426614174000'],
  ['API_KEY = "your-api-key-here"', 'settings.py'],
  ['PASSWORD=' + rng(4)(20), 'README.md'],
]

test('placeholders, examples, test keys and look-alikes pass', () => {
  for (const [text, path] of QUIET) expect([text.slice(0, 40), kinds(text, path)]).toEqual([text.slice(0, 40), []])
})

test('the same fakes pass once written as obvious examples', () => {
  expect(kinds('gh' + 'p_' + 'EXAMPLE' + rng(6)(29))).toEqual([])
  expect(kinds('sk-' + 'proj-' + 'your-key-' + 'x'.repeat(40))).toEqual([])
})

test('paths the person allows are not looked at', () => {
  expect(pathAllowed('/repo/tests/fixtures/keys.json', ['tests/fixtures/**'])).toBe(true)
  expect(pathAllowed('C:\\repo\\tests\\fixtures\\a\\b.txt', ['tests/fixtures/**'])).toBe(true)
  expect(pathAllowed('/repo/src/keys.json', ['tests/fixtures/**'])).toBe(false)
  expect(pathAllowed('/repo/demo.env', ['*.env'])).toBe(true)
})

test('env files and entropy', () => {
  expect(isEnvFile('/p/.env')).toBe(true)
  expect(isEnvFile('/p/prod.env')).toBe(true)
  expect(isEnvFile('/p/.env.example')).toBe(false)
  expect(isEnvFile('/p/env.ts')).toBe(false)
  expect(entropy('aaaa')).toBe(0)
  expect(entropy(rng(8)(40))).toBeGreaterThan(4)
})
