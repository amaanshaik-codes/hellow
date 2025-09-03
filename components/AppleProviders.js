import '../app/apple.css';
import * as Tooltip from '@radix-ui/react-tooltip';

export default function AppleProviders({ children }) {
  // ensure initial theme class is present on first render
  if (typeof document !== 'undefined' && !document.body.classList.contains('theme-light') && !document.body.classList.contains('theme-dark')) {
    document.body.classList.add(localStorage.getItem('theme') || 'theme-light');
  }
  return (
    <Tooltip.Provider delayDuration={250}>
      {children}
    </Tooltip.Provider>
  );
}
