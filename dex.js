// Moralis variables
const serverUrl = "CHANGE_ME"; // Your Moralis Server URL
const appId = "CHANGE_ME"; // Your Moralis Application ID

// connect to Moralis server and init plugins
Moralis.start({ serverUrl, appId });
Moralis.initPlugins().then(() => console.log('Plugins have been initialized'));

// HTML elements variables
const $tokenBalanceTbody = document.querySelector('.js-token-balances');
const $selectedToken = document.querySelector('.js-from-token');
const $amountInput = document.querySelector('.js-from-amount');
const $swapTokenDropdown = document.querySelector('[name=to-token]');
const $swapQuoteButton = document.querySelector('.js-submit');
const $swapCancelButton = document.querySelector('.js-cancel');
const $quoteContainer = document.querySelector('.js-quote-container');
const $amountError = document.querySelector('.js-amount-error');

// Token dropdown preparation
async function getTopTokens() {
  const response = await fetch('https://api.coinpaprika.com/v1/coins');
  const tokens = await response.json();

  return tokens
    .filter(token => token.rank >= 1 && token.rank <= 30)
    .map(token => token.symbol);
}

async function getTicketData(tickerList) {
  // const response = await fetch('https://api.1inch.exchange/v3.0/137/tokens');
  // const tokens = await response.json();

  const tokens = await Moralis.Plugins.oneInch.getSupportedTokens({
    chain: 'bsc', // The blockchain you want to use (eth/bsc/polygon)
  });
  const tokenList = Object.values(tokens.tokens);

  return tokenList.filter(token => tickerList.includes(token.symbol));
}

function renderTokenDropdown(tokens) {
  const options = tokens.map(token => `
     <option value="${token.address}-${token.decimals}">
      ${token.name}
     </option>
    `).join('');

  $swapTokenDropdown.innerHTML = options;
}

//Login-logout and initialization
async function login() {
  let user = Moralis.User.current();

  if (!user) {
    user = await Moralis.authenticate();
  }

  getStats();
}

function initSwapForm(event) {
  event.preventDefault();

  $selectedToken.innerText = event.target.dataset.symbol;
  $selectedToken.dataset.address = event.target.dataset.address;
  $selectedToken.dataset.decimals = event.target.dataset.decimals;
  $selectedToken.dataset.max = event.target.dataset.max;

  $swapQuoteButton.removeAttribute('disabled');
  $swapCancelButton.removeAttribute('disabled');
  $amountInput.removeAttribute('disabled');

  $amountInput.value = '';
  $quoteContainer.innerHTML = '';
  $amountError.innerText = '';
}

async function getStats() {
  // Change your tokens chain
  const options = { chain: 'binance' }
  const balances = await Moralis.Web3API.account.getTokenBalances(options);
  $tokenBalanceTbody.innerHTML = balances.map((token, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${token.symbol}</td>
      <td>${Moralis.Units.FromWei(token.balance, token.decimals)}</td>
      <td>
        <button class="js-swap btn btn-success" data-address="${token.token_address}" data-symbol="${token.symbol}" data-decimals="${token.decimals}" data-max="${Moralis.Units.FromWei(token.balance, token.decimals)}">
          Swap
        </button>
      </td>
    </tr>
    `).join('');

  for (let $btn of $tokenBalanceTbody.querySelectorAll('.js-swap')) {
    $btn.addEventListener('click', initSwapForm);
  }
}

function buyCrypto() {
  Moralis.Plugins.fiat.buy({ newTab: true });
}

async function logOut() {
  await Moralis.User.logOut();
  console.log("logged out");
}

document.getElementById("btn-login").addEventListener('click', login);
document.getElementById("btn-buy-crypto").addEventListener('click', buyCrypto);
document.getElementById("btn-logout").addEventListener('click', logOut);

// Quote and swap
async function swapTokens(event, fromTokenAddress, toTokenAddress, amount) {
  event.preventDefault();

  const receipt = await Moralis.Plugins.oneInch.swap({
    chain: 'bsc', // The blockchain you want to use (eth/bsc/polygon)
    fromTokenAddress, // The token you want to swap
    toTokenAddress, // The token you want to receive
    amount, // Amount of token to swap
    fromAddress: Moralis.User.current().get('ethAddress'), // Your wallet address
    slippage: 1,
  });
  console.log('receipt', receipt);
}

async function formSubmitted(event) {
  event.preventDefault();

  const fromAmount = Number.parseFloat($amountInput.value);
  const fromMaxValue = Number.parseFloat($selectedToken.dataset.max);

  if (Number.isNaN(fromAmount) || fromAmount > fromMaxValue) {
    $amountError.innerText = 'Inalid amount';

    return;
  } else {
    $amountError.innerText = '';
  }

  const fromDecimals = $selectedToken.dataset.decimals;
  const fromTokenAddress = $selectedToken.dataset.address;
  const [toTokenAddress, toDecimals] = $swapTokenDropdown.value.split('-');

  try {
    const quote = await Moralis.Plugins.oneInch.quote({
      chain: 'bsc', // The blockchain you want to use (eth/bsc/polygon)
      fromTokenAddress, // The token you want to swap
      toTokenAddress, // The token you want to receive
      amount: Moralis.Units.Token(fromAmount, fromDecimals).toString(),
    });

    const toAmount = Moralis.Units.FromWei(quote.toTokenAmount, toDecimals);
    $quoteContainer.innerHTML = `
      <p>${fromAmount} ${quote.fromToken.symbol} = ${toAmount} ${quote.toToken.symbol}</p>
      <p> Gas fee: ${quote.estimatedGas}</p>
      <button class="btn btn-success" onclick="swapTokens(event, ${fromTokenAddress}, ${toTokenAddress}, ${Moralis.Units.Token(fromAmount, fromDecimals).toString()})">Perform Swap</button>
    `;

  } catch (e) {
    console.error('error during swapping token', e);
    $quoteContainer.innerHTML = `
      <p class="error">The conversion didn't succeed.</p>
    `;
  }
}

function formCanceled(event) {
  event.preventDefault();

  $swapQuoteButton.setAttribute('disabled', '');
  $swapCancelButton.setAttribute('disabled', '');
  $amountInput.setAttribute('disabled', '');

  $amountInput.value = '';
  $quoteContainer.innerHTML = '';
  $amountError.innerText = '';

  delete $selectedToken.dataset.address;
  delete $selectedToken.dataset.decimals;
  delete $selectedToken.dataset.max;
}

$swapQuoteButton.addEventListener('click', formSubmitted);
$swapCancelButton.addEventListener('click', formCanceled);

// init
getTopTokens()
  .then(getTicketData)
  .then(renderTokenDropdown);