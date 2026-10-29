// Runs inside the NotebookLM tab (chrome.scripting, world "MAIN"), so the call
// goes out exactly as the web app's own do: same origin, same sign-in. The
// session tokens live only in the page, in WIZ_global_data.
//
// Chrome copies this function's source into the page, so it must not use
// anything from outside its own body.
export async function callInPage(endpoint, query, fReq) {
  const session = window.WIZ_global_data;
  if (!session || typeof session.SNlM0e !== 'string' || !session.SNlM0e) {
    return { signedOut: true };
  }

  const params = new URLSearchParams(query);
  if (session.FdrFJe) params.set('f.sid', session.FdrFJe);
  if (session.cfb2h) params.set('bl', session.cfb2h);
  if (document.documentElement.lang) params.set('hl', document.documentElement.lang);
  // With several Google accounts signed in, the tab's account is the one in
  // its address.
  const account = new URLSearchParams(location.search).get('authuser');
  if (account) params.set('authuser', account);

  const body = new URLSearchParams({ 'f.req': fReq, at: session.SNlM0e });
  try {
    const response = await fetch(`${endpoint}?${params}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Same-Domain': '1',
      },
      body: `${body}&`,
    });
    return { status: response.status, text: await response.text() };
  } catch (error) {
    return { networkError: String(error?.message ?? error) };
  }
}
