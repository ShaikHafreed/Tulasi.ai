// Generation-complete notifications via the browser Notification API — for
// when the user has navigated away from the progress screen during the
// 1-3 minute Meshy wait. Purely additive: the in-app toast/progress UI
// already works regardless of permission state, this just adds a second
// channel when it's actually granted.

function supported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!supported()) return 'unsupported'
  return Notification.permission
}

// Only prompts if permission hasn't already been decided — a user who
// already denied it shouldn't get re-prompted every scan.
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!supported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

export function notifyGenerationComplete(objectName?: string | null): void {
  if (!supported() || Notification.permission !== 'granted') return
  try {
    const notification = new Notification('Your 3D model is ready', {
      body: objectName ? `${objectName} finished generating in Tulasi.` : 'Your scan finished generating in Tulasi.',
      icon: '/favicon.svg',
      tag: 'tulasi-generation-complete',
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  } catch {
    // Some browsers (e.g. iOS Safari) advertise the API but throw on
    // construction outside specific contexts — fail silently, the in-app
    // toast already covers this.
  }
}
