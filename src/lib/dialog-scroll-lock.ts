export function lockBodyScroll(): () => void {
  const { scrollX, scrollY } = window;
  const body = document.body;
  const styles = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    width: body.style.width,
    overflow: body.style.overflow,
  };
  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
  body.style.left = `-${scrollX}px`;
  body.style.width = '100%';
  body.style.overflow = 'hidden';

  return () => {
    body.style.position = styles.position;
    body.style.top = styles.top;
    body.style.left = styles.left;
    body.style.width = styles.width;
    body.style.overflow = styles.overflow;
    window.scrollTo(scrollX, scrollY);
  };
}
