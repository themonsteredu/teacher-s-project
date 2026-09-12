import {parseHTML} from 'linkedom';

// LinkeDOM provides HTML parsing/selectors; reflect native form properties for event tests.
// Browser verification covers layout, focus and native select/checkbox behavior.
export function domFixture(html='<main></main>') {
  const window=parseHTML(html);
  Object.defineProperty(window.HTMLInputElement.prototype,'checked',{
    configurable:true,get(){return this.hasAttribute('checked');},set(value){this.toggleAttribute('checked',!!value);},
  });
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{
    configurable:true,get(){return (this.querySelector('option[selected]')||this.querySelector('option'))?.getAttribute('value')||'';},
    set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.getAttribute('value')===String(value));},
  });
  return window.document;
}
export const esc=value=>String(value??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
