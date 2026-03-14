const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Serve static files from client folder
app.use(express.static(path.join(__dirname, '../client')));

const RATES_FILE = path.join(__dirname, 'rates.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');
const TRANSACTIONS_FILE = path.join(__dirname, 'transactions.json');
const CUSTOMERS_FILE = path.join(__dirname, 'customers.json');

// Ensure files exist
async function ensureFiles() {
  const files = [RATES_FILE, HISTORY_FILE, TRANSACTIONS_FILE, CUSTOMERS_FILE];
  for (const file of files) {
    try {
      await fs.access(file);
    } catch {
      // Create default rates if rates.json doesn't exist
      if (file === RATES_FILE) {
        const defaultRates = [
          { currency: 'USD', buy: 1320, sell: 1335, flag: '🇺🇸', name: 'US Dollar', trend: 'stable', updatedAt: new Date().toISOString() },
          { currency: 'GBP', buy: 1825, sell: 1850, flag: '🇬🇧', name: 'British Pound', trend: 'stable', updatedAt: new Date().toISOString() },
          { currency: 'EUR', buy: 1610, sell: 1635, flag: '🇪🇺', name: 'Euro', trend: 'stable', updatedAt: new Date().toISOString() },
          { currency: 'CAD', buy: 900, sell: 1000, flag: '🇨🇦', name: 'Canadian Dollar', trend: 'stable', updatedAt: new Date().toISOString() },
          { currency: 'ZAR', buy: 65, sell: 85, flag: '🇿🇦', name: 'South African Rand', trend: 'stable', updatedAt: new Date().toISOString() },
          { currency: 'AUD', buy: 850, sell: 950, flag: '🇦🇺', name: 'Australian Dollar', trend: 'stable', updatedAt: new Date().toISOString() },
          { currency: 'AED', buy: 360, sell: 390, flag: '🇦🇪', name: 'UAE Dirham', trend: 'stable', updatedAt: new Date().toISOString() },
          { currency: 'CNY', buy: 190, sell: 205, flag: '🇨🇳', name: 'Chinese Yuan', trend: 'stable', updatedAt: new Date().toISOString() },
          { currency: 'GHS', buy: 100, sell: 115, flag: '🇬🇭', name: 'Ghana Cedi', trend: 'stable', updatedAt: new Date().toISOString() }
        ];
        await fs.writeFile(file, JSON.stringify(defaultRates, null, 2));
      } else {
        await fs.writeFile(file, '[]');
      }
    }
  }
}
ensureFiles();

// GET rates
app.get('/api/rates', async (req, res) => {
  try {
    const data = await fs.readFile(RATES_FILE, 'utf8');
    const rates = JSON.parse(data);
    
    await saveHistory(rates);
    
    res.json({
      rates,
      lastUpdated: new Date().toISOString(),
      marketOpen: isMarketOpen(),
      nextUpdate: new Date(Date.now() + 30000).toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load rates' });
  }
});

// GET rate history for charts
app.get('/api/rates/history/:currency', async (req, res) => {
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf8');
    const history = JSON.parse(data);
    const currencyHistory = history.filter(h => h.currency === req.params.currency).slice(-50);
    res.json(currencyHistory);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// POST update rates
app.post('/api/rates', async (req, res) => {
  const token = req.headers.authorization;
  if (!token || !token.includes('admin-token')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const oldData = await fs.readFile(RATES_FILE, 'utf8');
    const oldRates = JSON.parse(oldData);
    await saveHistory(oldRates);
    
    const newRates = req.body.map(rate => ({
      ...rate,
      updatedAt: new Date().toISOString(),
      trend: calculateTrend(rate, oldRates.find(r => r.currency === rate.currency))
    }));
    
    await fs.writeFile(RATES_FILE, JSON.stringify(newRates, null, 2));
    res.json({ success: true, rates: newRates });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update' });
  }
});

// Save transaction
app.post('/api/transactions', async (req, res) => {
  try {
    const data = await fs.readFile(TRANSACTIONS_FILE, 'utf8');
    const transactions = JSON.parse(data);
    
    const transaction = {
      id: 'TXN-' + Date.now(),
      ...req.body,
      timestamp: new Date().toISOString()
    };
    
    transactions.push(transaction);
    await fs.writeFile(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
    
    await saveCustomer(req.body.customer);
    
    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save transaction' });
  }
});

// GET transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const data = await fs.readFile(TRANSACTIONS_FILE, 'utf8');
    const transactions = JSON.parse(data);
    res.json(transactions.slice(-20).reverse());
  } catch (error) {
    res.status(500).json({ error: 'Failed to load transactions' });
  }
});

// GET customers
app.get('/api/customers', async (req, res) => {
  try {
    const data = await fs.readFile(CUSTOMERS_FILE, 'utf8');
    const customers = JSON.parse(data);
    res.json(customers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load customers' });
  }
});

// Admin login
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (username === 'admin' && password === 'admin123') {
    res.json({ 
      token: 'admin-token-' + Date.now(), 
      username: 'admin' 
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Generate receipt
app.post('/api/receipts/generate', async (req, res) => {
  const receiptId = 'ALN-' + Date.now();
  res.json({ success: true, receiptId });
});

// All other routes serve the HTML
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Helper functions
async function saveHistory(rates) {
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf8');
    const history = JSON.parse(data);
    
    rates.forEach(rate => {
      history.push({
        currency: rate.currency,
        buy: rate.buy,
        sell: rate.sell,
        timestamp: new Date().toISOString()
      });
    });
    
    if (history.length > 5000) {
      history.splice(0, history.length - 5000);
    }
    
    await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error('History save error:', error);
  }
}

async function saveCustomer(customer) {
  if (!customer || !customer.phone) return;
  
  try {
    const data = await fs.readFile(CUSTOMERS_FILE, 'utf8');
    const customers = JSON.parse(data);
    
    const exists = customers.find(c => c.phone === customer.phone);
    if (!exists) {
      customers.push({
        ...customer,
        firstVisit: new Date().toISOString(),
        visits: 1
      });
      await fs.writeFile(CUSTOMERS_FILE, JSON.stringify(customers, null, 2));
    } else {
      exists.visits++;
      exists.lastVisit = new Date().toISOString();
      await fs.writeFile(CUSTOMERS_FILE, JSON.stringify(customers, null, 2));
    }
  } catch (error) {
    console.error('Customer save error:', error);
  }
}

function calculateTrend(newRate, oldRate) {
  if (!oldRate) return 'stable';
  if (newRate.buy > oldRate.buy) return 'up';
  if (newRate.buy < oldRate.buy) return 'down';
  return 'stable';
}

function isMarketOpen() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  return day >= 1 && day <= 6 && hour >= 8 && hour < 19;
}

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;