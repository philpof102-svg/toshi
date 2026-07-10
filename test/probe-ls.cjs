console.log('typeof localStorage:', typeof localStorage);
if (typeof localStorage !== 'undefined') {
  console.log('keys:', Object.keys(localStorage).join(','));
  console.log('typeof getItem:', typeof localStorage.getItem);
}
