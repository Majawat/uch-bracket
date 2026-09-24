document.addEventListener('DOMContentLoaded', () => {
  if (new URLSearchParams(window.location.search).get('mode') === 'big') {
    document.body.classList.add('big-screen');
  }
  UCH.UI.init();
});

window.addEventListener('storage', (e) => {
  if (e.key === 'uch_lan_state') {
    UCH.State.load();
    UCH.UI.refresh();
  }
});