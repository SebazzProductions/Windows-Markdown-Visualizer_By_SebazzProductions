document.body.dataset.scriptLoaded = 'yes';
document.getElementById('asset-target').textContent = 'HTML + Assets OK';

const result = document.createElement('p');
result.id = 'asset-script-result';
result.textContent = 'Script OK';
document.body.appendChild(result);