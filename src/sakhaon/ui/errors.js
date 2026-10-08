/* LLMError.code → user-facing copy and the action offered next to Retry. */

const GENERIC = 'Something interrupted us. Your words are safe. Try again?';

/**
 * @returns {{ text:string, action:'settings'|'retry'|'new'|'continue'|null, details?:string, countdown?:boolean }}
 */
export function errorCopy(err, { providerLabel = 'the provider' } = {}) {
  const code = err?.code || 'stream';
  switch (code) {
    case 'auth': return { text: "That key didn't work. Check it in Settings.", action: 'settings' };
    case 'permission': return { text: "This key can't use that model.", action: 'settings' };
    case 'not_found': return { text: 'Model id not recognised. Pick another.', action: 'settings' };
    case 'rate_limit': return { text: 'Too many requests.', action: 'retry', countdown: true };
    case 'quota': return { text: 'Your provider account is out of credit or quota.', action: 'settings' };
    case 'overloaded':
    case 'server': return { text: 'The provider is busy. Try again.', action: 'retry' };
    case 'context_length': return { text: 'This chat has grown long. Start a new one?', action: 'new' };
    case 'safety': return { text: 'The provider declined to answer this. Try rephrasing.', action: null };
    case 'network': return {
      text: `Couldn't reach ${providerLabel} from the browser (network or CORS). Check your connection or try Proxy mode.`,
      action: 'settings',
    };
    case 'config': return { text: err?.message || 'Finish setting up a model in Settings.', action: 'settings' };
    case 'aborted': return { text: '', action: 'continue' };
    case 'stream':
    case 'proxy':
    case 'invalid_request':
    default: return { text: GENERIC, action: 'retry', details: err?.message || '' };
  }
}

export const ACTION_LABELS = { settings: 'Open settings', retry: 'Retry', new: 'New chat', continue: 'Continue' };
