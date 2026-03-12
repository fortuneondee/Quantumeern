import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
// Remove static import of vite
// import { createServer as createViteServer } from 'vite';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

dotenv.config();

// --- FIREBASE INITIALIZATION ---
let db: any = null;

try {
  if (getApps().length === 0) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        initializeApp({
          credential: cert(serviceAccount),
          projectId: 'quantumeern'
        });
        console.log('Firebase Admin initialized with service account');
      } catch (parseError) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', parseError);
        // Fallback to default init
        initializeApp({ projectId: 'quantumeern' });
      }
    } else {
      initializeApp({ projectId: 'quantumeern' });
      console.log('Firebase Admin initialized with default credentials');
    }
  }
  
  db = getFirestore();
  console.log('Firestore initialized successfully');
} catch (error) {
  console.error('CRITICAL: Firebase Admin initialization failed:', error);
  // Do NOT re-throw, let the server start without DB
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // --- API ROUTES ---

  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      database: db ? 'connected' : 'disconnected' 
    });
  });

  // Helper to get Korapay settings
  async function getKorapaySettings() {
    // 1. Try Environment Variables First (Bypass DB if keys are in Env)
    if (process.env.KORAPAY_SECRET_KEY) {
      console.log('Using Korapay settings from Environment Variables');
      return {
        secretKey: process.env.KORAPAY_SECRET_KEY,
        publicKey: process.env.KORAPAY_PUBLIC_KEY || '',
        webhookSecret: process.env.KORAPAY_WEBHOOK_SECRET || '',
        depositsEnabled: true,
        minDeposit: Number(process.env.KORAPAY_MIN_DEPOSIT) || 1000,
        depositChargeType: 'fixed',
        depositChargeValue: 0,
        mode: process.env.NODE_ENV === 'production' ? 'live' : 'sandbox'
      };
    }

    if (!db) {
      console.error('Database not initialized. Cannot fetch Korapay settings.');
      return null;
    }
    try {
      const publicSnap = await db.collection('system').doc('korapay').get();
      const secretSnap = await db.collection('vault').doc('korapay').get();
      
      if (!publicSnap.exists) {
        console.warn('system/korapay document does not exist.');
        return null;
      }
      
      const publicData = publicSnap.data();
      const secretData = secretSnap.exists ? secretSnap.data() : {};
      
      return { ...publicData, ...secretData };
    } catch (error: any) {
      if (error.code === 7 || error.message.includes('PERMISSION_DENIED')) {
        console.error('CRITICAL: Permission Denied fetching Korapay settings. Please set KORAPAY_SECRET_KEY in .env or fix Firebase Admin permissions.');
      } else {
        console.error('Error fetching Korapay settings:', error);
      }
      return null;
    }
  }

  // Korapay Deposit Initialization
  app.post('/api/deposits/initialize', async (req, res) => {
    if (!db) {
      console.error('Database not initialized');
      return res.status(503).json({ error: 'Database unavailable' });
    }
    
    try {
      console.log('Initializing Korapay deposit...');
      const { userId, amount, email, name } = req.body;
      const settings = await getKorapaySettings();

      if (!settings) {
        console.error('Failed to retrieve Korapay settings');
        return res.status(400).json({ error: 'Payment configuration unavailable.' });
      }

      if (!settings.depositsEnabled) {
        return res.status(400).json({ error: 'Deposits are currently disabled.' });
      }

      if (amount < settings.minDeposit) {
        return res.status(400).json({ error: `Minimum deposit is ${settings.minDeposit} NGN.` });
      }

      // Calculate charge
      let charge = 0;
      if (settings.depositChargeType === 'fixed') {
        charge = settings.depositChargeValue;
      } else if (settings.depositChargeType === 'percentage') {
        charge = (amount * settings.depositChargeValue) / 100;
      }
      
      const totalAmount = amount + charge;
      const reference = `kp_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      console.log(`Creating transaction ${reference} for ${amount} NGN`);

      // Create pending transaction
      // Wrap in try-catch to handle Firestore permission errors specifically
      try {
        await db.collection('transactions').doc(reference).set({
          userId,
          type: 'KORAPAY_DEPOSIT',
          amount: amount, // Amount to credit (NGN)
          charge: charge,
          totalAmount: totalAmount, // Amount user pays (NGN)
          currency: 'NGN',
          status: 'PENDING',
          reference,
          createdAt: FieldValue.serverTimestamp(),
          gateway: 'korapay'
        });
      } catch (dbError: any) {
        console.error('Firestore write failed:', dbError);
        // If we can't write to Firestore, we can't track the transaction properly.
        // However, if it's a permission error, it might be due to missing service account.
        // We'll abort to prevent untracked payments.
        return res.status(500).json({ error: 'Transaction recording failed. Please contact support.' });
      }

      const appUrl = process.env.APP_URL || 'http://localhost:3000';

      // Call Korapay API
      console.log('Calling Korapay API...');
      const response = await fetch('https://api.korapay.com/merchant/api/v1/charges/initialize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reference,
          amount: totalAmount,
          currency: 'NGN',
          customer: {
            name: name || 'User',
            email: email
          },
          redirect_url: `${appUrl}/wallet?status=success`, 
          notification_url: `${appUrl}/api/korapay/webhook` 
        })
      });

      const data = await response.json();
      console.log('Korapay response:', data.status ? 'Success' : 'Failed');

      if (!data.status) {
        throw new Error(data.message || 'Failed to initialize transaction');
      }

      if (!data.data || !data.data.checkout_url) {
        console.error('Invalid Korapay response format:', data);
        throw new Error('Invalid response from payment gateway');
      }

      res.json({ checkoutUrl: data.data.checkout_url, reference });

    } catch (error: any) {
      console.error('Deposit init error:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });

  // Korapay Webhook
  app.post('/api/korapay/webhook', async (req, res) => {
    if (!db) return res.sendStatus(503);
    
    try {
      const signature = req.headers['x-korapay-signature'];
      const settings = await getKorapaySettings();
      
      if (!settings) return res.status(500).send('Settings not found');

      // Verify signature (HMAC SHA256)
      const crypto = await import('crypto');
      const hash = crypto.createHmac('sha256', settings.webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (hash !== signature) {
        return res.status(400).send('Invalid signature');
      }

      const { event, data } = req.body;

      if (event === 'charge.success') {
        const { reference, status } = data;
        
        if (status === 'success') {
          const txRef = db.collection('transactions').doc(reference);
          
          await db.runTransaction(async (t: any) => {
            const txDoc = await t.get(txRef);
            if (!txDoc.exists) return; // Transaction not found
            
            const txData = txDoc.data();
            if (txData?.status === 'SUCCESS') return; // Already processed

            // Update transaction
            t.update(txRef, { 
              status: 'SUCCESS', 
              gatewayResponse: data,
              updatedAt: FieldValue.serverTimestamp()
            });

            // Credit user wallet (Capital Balance)
            // Convert NGN to USDT
            const settingsDoc = await t.get(db.collection('system').doc('settings'));
            const platformSettings = settingsDoc.data();
            const rate = platformSettings?.depositRateNgn || 1500; // Default fallback
            
            const usdtAmount = txData?.amount / rate;

            const userRef = db.collection('users').doc(txData?.userId);
            t.update(userRef, {
              capitalBalance: FieldValue.increment(usdtAmount)
            });
          });
        }
      }

      res.sendStatus(200);
    } catch (error) {
      console.error('Webhook error:', error);
      res.sendStatus(500);
    }
  });

  // --- VITE MIDDLEWARE (Development Only) ---
  if (process.env.NODE_ENV !== 'production') {
    try {
      // Dynamic import to avoid production crash if vite is missing
      const { createServer } = await import('vite');
      const vite = await createServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('Vite middleware attached');
    } catch (viteError) {
      console.error('CRITICAL: Vite middleware failed to initialize:', viteError);
    }
  } else {
    // Production: Serve static files
    app.use(express.static('dist'));
    
    // SPA fallback
    app.use((req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  // --- START SERVER ---
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('CRITICAL: Server failed to start:', err);
});
