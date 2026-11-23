import assert from 'node:assert/strict';
import test from 'node:test';
import {t} from '../../src/i18n/index.ts';
import {DISPLAY_CODES} from '../../src/i18n/kernel-map.ts';
import {chatgptFailureReason,chatgptFailureText} from '../../src/commands/provider-chatgpt.ts';

/* CLI 0.6.10, stress test 0.6.9: a ChatGPT plan request the service refused came out as «The ChatGPT sign-in failed. Run `talos
   provider login chatgpt` again.» while the sign-in was valid. The engine gives CHATGPT_ERRORE to a request that did not complete too. */
test('CHATGPT_ERROR does not blame the sign-in: the request did not complete, and the logs have the details',()=>{
  assert.equal(DISPLAY_CODES.CHATGPT_ERRORE,'CHATGPT_ERROR');
  const what=t('error.code.CHATGPT_ERROR.what');
  assert.doesNotMatch(what,/sign-in/iu,'the ChatGPT error still says the sign-in failed');
  assert.match(what,/did not complete/u);
  assert.match(t('error.code.CHATGPT_ERROR.todo'),/talos logs/u);
});

/* 0.6.10 bugfixer: during a sign-in there is no plan request, so the generic code keeps the generic sign-in sentence there. */
test('a sign-in that ends with the generic code is not told as a plan request',()=>{
  assert.doesNotMatch(chatgptFailureReason('CHATGPT_ERRORE'),/plan did not complete/u);
  assert.equal(chatgptFailureReason('CHATGPT_ERRORE'),t('screen.provider.oauthError.other'));
  assert.equal(chatgptFailureText('CHATGPT_ERRORE'),t('key.chatgpt.login.failedCode',{code:'CHATGPT_ERROR'}));
  assert.equal(chatgptFailureReason('CHATGPT_SCAMBIO_RIFIUTATO'),t('error.code.CHATGPT_EXCHANGE_REFUSED.what'),'a precise sign-in code keeps its own words');
});
