require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const axios = require('axios');
const cookieSession = require('cookie-session');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Initialize Stripe
const app = express();

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

app.use(
  cookieSession({
    name: 'session',
    keys: [process.env.COOKIE_KEY],
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  })
);

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/auth/linkedin', (req, res) => {
  const state = Math.random().toString(36).substring(7);
  const scope = 'openid profile email';
  const authURL = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${process.env.REDIRECT_URI}&state=${state}&scope=${scope}`;
  console.log('Redirecting to LinkedIn auth URL:', authURL); // Debugging line
  res.redirect(authURL);
});

app.get('/auth/linkedin/callback', async (req, res) => {
  const { code } = req.query;

  console.log('Received LinkedIn callback with code:', code); // Debugging line

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  try {
    const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        scope: 'openid profile email' // Include openid scope
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const accessToken = tokenResponse.data.access_token;

    // Debugging line to check the access token
    console.log('Received LinkedIn access token:', accessToken);

    const userInfoResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    // Debugging line to check the user info response
    console.log('Received LinkedIn user info:', userInfoResponse.data);

    const user = {
      name: userInfoResponse.data.name,
      email: userInfoResponse.data.email,
      sub: userInfoResponse.data.sub
    };

    req.session.user = user;
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error during LinkedIn callback:', error.response ? error.response.data : error.message);
    res.redirect('/error');
  }
});

app.post('/create-checkout-session', async (req, res) => {
  try {
    console.log('Creating checkout session');
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: 'price_1PaL9g2K4It4BnZjccAXTsCH', // Replace with your recurring price ID
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: 'http://localhost:3000/success',
      cancel_url: 'http://localhost:3000/cancel',
    });

    console.log('Checkout session created:', session.id); // Debugging line

    res.json({ id: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error); // Detailed logging
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});


app.get('/dashboard', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  res.render('dashboard', { 
    user: req.session.user,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY // Pass the publishable key to the frontend
  });
});

app.get('/success', (req, res) => {
  res.render('success');
});

app.get('/cancel', (req, res) => {
  res.render('cancel');
});

app.get('/error', (req, res) => {
  res.send('Authentication error. Please try again.');
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
