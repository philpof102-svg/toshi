const localStorage = (() => {
  const s = new Map();
  return { getItem:(k)=>s.has(k)?s.get(k):null, setItem:(k,v)=>s.set(k,String(v)), removeItem:(k)=>s.delete(k), clear:()=>s.clear() };
})();
console.log('typeof:', typeof localStorage);
console.log('typeof getItem:', typeof localStorage.getItem);
localStorage.setItem('foo', 'bar');
console.log('roundtrip:', localStorage.getItem('foo'));
