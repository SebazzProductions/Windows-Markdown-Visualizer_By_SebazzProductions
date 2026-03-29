interface ResultPayload {
  message: string;
}

const payload: ResultPayload = { message: 'TS OK' };
console.log('ts-executed');
document.body.innerHTML = `<div id="ts-result">${payload.message}</div>`;