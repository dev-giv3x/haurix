const SteamUser = require('steam-user'); 
const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');

const CONFIG = {
  proxies: [
    'http://xl1122:666666@217.194.153.171:50100',
    'http://maksim2464:3XYXG5t2M7@82.211.7.40:59100',
    'http://smoozyherald64:jeo3ZxPXHN@87.246.11.138:50100',
  ],
  dataDir: './steam_data'
};

class SteamAccountManager {
  constructor() {
    this.clients = new Map();
    this.userProxies = new Map();  // Хранит, какой прокси закреплен за каким userId
    this.ensureDataDir();
  }

  ensureDataDir() {
    if (!fs.existsSync(CONFIG.dataDir)) {
      fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    }
  }

  getUserDir(userId) {
    return path.join(CONFIG.dataDir, `user_${userId}`);
  }

  getProxyForUser(userId) {
    if (this.userProxies.has(userId)) {
      return this.userProxies.get(userId);
    }
    const proxy = CONFIG.proxies[Math.floor(Math.random() * CONFIG.proxies.length)];
    this.userProxies.set(userId, proxy);
    return proxy;
  }

  async initClient(userId) {
    const userDir = this.getUserDir(userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    const proxyUrl = this.getProxyForUser(userId);
    const proxyAgent = new HttpsProxyAgent(proxyUrl);
    const machineName = `SteamKit_${userId}`;

    const client = new SteamUser({
      dataDirectory: userDir,
      machineIdType: 1,
      httpAgent: proxyAgent,
      machineName,
      enablePicsCache: true
    });

    this.setupEventHandlers(client, userId, userDir);
    this.clients.set(userId, { client, loggedIn: false });
    return client;
  }

  setupEventHandlers(client, userId, userDir) {
    client.on('machineAuth', (auth) => {
      const authFile = path.join(userDir, `machineAuth_${auth.filename}`);
      fs.writeFileSync(authFile, auth.bytes);
      console.log(`[${userId}] 🔑 MachineAuth сохранен в ${authFile}`);
    });

    client.on('loggedOn', () => {
      console.log(`[${userId}] ✅ Успешный вход в Steam`);
      this.clients.get(userId).loggedIn = true;
       client.setPersona(SteamUser.EPersonaState.Online);
    });

    client.on('steamGuard', (domain, callback) => {
      console.log(`[${userId}] 🔐 Требуется Steam Guard (${domain || 'Mobile'})`);
      this.clients.get(userId).guardCallback = callback;
    });

    client.on('error', (err) => {
      console.error(`[${userId}] 🚨 Ошибка:`, err.message);
      if (err.eresult === SteamUser.EResult.InvalidPassword) {
        this.clearAuthFiles(userId);
      }
    });

    client.on('debug', (msg) => {
      fs.appendFileSync(path.join(userDir, 'debug.log'), `${new Date().toISOString()} ${msg}\n`);
    });
  }

  clearAuthFiles(userId) {
    const userDir = this.getUserDir(userId);
    if (fs.existsSync(userDir)) {
      fs.readdirSync(userDir)
        .filter(f => f.startsWith('machineAuth_'))
        .forEach(f => fs.unlinkSync(path.join(userDir, f)));
    }
  }

  async login(userId, credentials) {
    try {
      let client;
      if (!this.clients.has(userId)) {
        client = await this.initClient(userId);
      } else {
        client = this.clients.get(userId).client;
      }

      const userDir = this.getUserDir(userId);
      const authFiles = fs.readdirSync(userDir).filter(f => f.startsWith('machineAuth_'));

      if (authFiles.length > 0) {
        const latestAuth = authFiles.sort().pop();
        const authData = fs.readFileSync(path.join(userDir, latestAuth));
        client.setMachineAuth({
          filename: latestAuth.replace('machineAuth_', ''),
          bytes: authData
        });
      }

      const logOnOptions = {
        accountName: credentials.login,
        password: credentials.password,
        twoFactorCode: credentials.twoFactorCode,
        machineName: `SteamKit_${userId}`
      };

      client.logOn(logOnOptions);
      console.log(`[${userId}] ⏳ Выполняется вход с прокси ${this.getProxyForUser(userId)}...`);

    } catch (err) {
      console.error(`[${userId}] ❌ Ошибка входа:`, err);
      throw err;
    }
  }

  confirmSteamGuard(userId, code) {
    const account = this.clients.get(userId);
    if (account?.guardCallback) {
      account.guardCallback(code);
      delete account.guardCallback;
      return true;
    }
    return false;
  }

  startBoost(userId, appIds) {
    const account = this.clients.get(userId);
    if (!account?.loggedIn) {
      throw new Error(`Аккаунт ${userId} не авторизован`);
    }

    account.client.gamesPlayed(appIds);
    console.log(`[${userId}] 🎮 Запущены игры:`, appIds);
  }
}

module.exports = SteamAccountManager;