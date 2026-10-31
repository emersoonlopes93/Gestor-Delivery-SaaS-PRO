export type GoogleCredentialResponse = { credential?: string };

type GoogleIdentityApi = {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
        auto_select: boolean;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: { theme: 'outline'; size: 'large'; text: 'continue_with'; width: number },
      ) => void;
    };
  };
};

const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services';

function getGoogleIdentityApi(): GoogleIdentityApi | null {
  const candidate: unknown = Reflect.get(window, 'google');
  if (!candidate || typeof candidate !== 'object') return null;
  const accounts: unknown = Reflect.get(candidate, 'accounts');
  if (!accounts || typeof accounts !== 'object') return null;
  const identity: unknown = Reflect.get(accounts, 'id');
  if (!identity || typeof identity !== 'object') return null;
  if (typeof Reflect.get(identity, 'initialize') !== 'function' || typeof Reflect.get(identity, 'renderButton') !== 'function') {
    return null;
  }
  return candidate as GoogleIdentityApi;
}

export function getGoogleClientId(): string | null {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  return clientId || null;
}

export function loadGoogleIdentityServices(): Promise<GoogleIdentityApi> {
  const loaded = getGoogleIdentityApi();
  if (loaded) return Promise.resolve(loaded);

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => {
        const google = getGoogleIdentityApi();
        if (google) resolve(google);
        else reject(new Error('Google Identity unavailable'));
      }, { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Identity unavailable')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_IDENTITY_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const google = getGoogleIdentityApi();
      if (google) resolve(google);
      else reject(new Error('Google Identity unavailable'));
    };
    script.onerror = () => reject(new Error('Google Identity unavailable'));
    document.head.appendChild(script);
  });
}
