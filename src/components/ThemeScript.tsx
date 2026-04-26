/**
 * Inline script injected into <head> to set the theme attribute before
 * first paint — eliminates flash. This must be a server component
 * so it can render <script> tags directly.
 */
export function ThemeScript() {
  const script = `(function(){try{var t=localStorage.getItem('nuke-theme');var r=t==='dark'||t==='light'?t:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',r);}catch(e){}})();`;
  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
