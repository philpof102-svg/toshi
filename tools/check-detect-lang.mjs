// Quick smoke test for detectLang — pure heuristic, no LLM call, no subprocess.
import { detectLang } from '../lib/llm.mjs';
const cases = [
  ['bonjour, ca va ?',                          'fr'],
  ['hello how are you',                         'en'],
  ['donde esta la funcion foo?',                 'es'],
  ['wo ist die Funktion bar?',                  'de'],
  ['dove si trova il file baz?',                'it'],
  ['ola, tudo bem?',                            'pt'],
  ['hallo, hoe gaat het?',                      'nl'],
  ['你好世界',                                   'zh'],
  ['こんにちは',                                 'ja'],
  ['안녕하세요',                                  'ko'],
  ['Привет, как дела?',                          'ru'],
  ['merhaba nasilsin',                          'tr'],
  ['czesc, co tam?',                            'pl'],
  ['مرحبا',                                      'ar'],
  ['what changed in the repo',                  'en'],
  ['qui appelle foo',                           'fr'],
  ['quoi de neuf',                              'fr'],
];
let pass = 0, fail = 0;
for (const [q, exp] of cases) {
  const got = detectLang(q);
  const ok = got === exp;
  console.log(JSON.stringify({ q, exp, got, ok }));
  if (ok) pass++; else fail++;
}
console.log('---');
console.log(JSON.stringify({ pass, fail, total: cases.length }));
process.exit(fail ? 1 : 0);
