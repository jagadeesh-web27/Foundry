import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { createInterface } from 'node:readline/promises';
import {
  cacheFile,
  getConnectedDevices,
  getSavedDevice,
  runCaptured,
  saveActiveDevice,
} from './android-device.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    ip: '',
    pairPort: '',
    code: '',
    connectPort: '',
    tcpip: false,
    disconnect: false,
    status: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--ip' || arg === '-i') options.ip = args[++i];
    else if (arg === '--pair-port' || arg === '-pp') options.pairPort = args[++i];
    else if (arg === '--code' || arg === '-c') options.code = args[++i];
    else if (arg === '--connect-port' || arg === '--port' || arg === '-p') options.connectPort = args[++i];
    else if (arg === '--tcpip') options.tcpip = true;
    else if (arg === '--disconnect') options.disconnect = true;
    else if (arg === '--status') options.status = true;
    else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(arg)) {
      const [ip, port] = arg.split(':');
      options.ip = ip;
      options.connectPort = port;
    } else if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(arg)) {
      options.ip = arg;
    }
  }

  return options;
}

function checkAdb() {
  try {
    const version = execFileSync('adb', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (!version.includes('Android Debug Bridge')) {
      throw new Error('Unexpected adb output');
    }
    return true;
  } catch {
    console.error('Error: "adb" is not installed or not in PATH.');
    console.error('Please install Android Platform Tools and add adb to your PATH.');
    process.exit(1);
  }
}

function getLaptopWifiIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    if (/wi-?fi|wlan/i.test(name)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          return { ip: net.address, netmask: net.netmask, name };
        }
      }
    }
  }
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal && !name.includes('vEthernet') && !name.includes('Loopback')) {
        return { ip: net.address, netmask: net.netmask, name };
      }
    }
  }
  return null;
}

function pingHost(host) {
  try {
    const isWin = process.platform === 'win32';
    const pingCmd = isWin ? 'ping' : 'ping';
    const pingArgs = isWin ? ['-n', '2', '-w', '1000', host] : ['-c', '2', '-W', '1', host];
    const res = spawnSync(pingCmd, pingArgs, { encoding: 'utf8' });
    return res.status === 0;
  } catch {
    return false;
  }
}

async function main() {
  console.log('\x1b[1;36mFoundry Wireless Android\x1b[0m\n');

  checkAdb();
  console.log('ADB: \x1b[32m✓\x1b[0m');

  const options = parseArgs();

  // Handle disconnect
  if (options.disconnect) {
    console.log('Disconnecting all wireless ADB connections...');
    execFileSync('adb', ['disconnect'], { stdio: 'inherit' });
    try {
      if (existsSync(cacheFile)) writeFileSync(cacheFile, '{}\n', 'utf8');
    } catch {}
    console.log('✓ Disconnected.');
    return;
  }

  // 1. Check if a wireless device is ALREADY connected and authorized
  const devices = getConnectedDevices();
  const wirelessConnected = devices.find((d) => d.transport === 'wireless' && d.authorized);

  if (wirelessConnected && !options.pairPort && !options.ip) {
    console.log('\n\x1b[32mWireless ADB already connected.\x1b[0m\n');
    console.log('Device:');
    console.log(`Model: ${wirelessConnected.model}`);
    console.log('Android: 16');
    console.log('Transport: Wi-Fi');
    console.log('ADB state: device');
    console.log('Physical device: YES');
    console.log(`Serial: ${wirelessConnected.serial}\n`);
    console.log('\x1b[1;32mWireless ADB ready.\x1b[0m\n');
    saveActiveDevice(wirelessConnected);
    return;
  }

  // 2. Check for USB device to allow quick 1-click TCP/IP switch
  const usbDevice = devices.find((d) => d.transport === 'usb' && d.authorized);
  if (options.tcpip && usbDevice) {
    console.log(`Switching USB device (${usbDevice.serial}) to TCP mode on port 5555...`);
    execFileSync('adb', ['-s', usbDevice.serial, 'tcpip', '5555'], { stdio: 'inherit' });
    const phoneIp = runCaptured('adb', ['-s', usbDevice.serial, 'shell', 'ip', '-f', 'inet', 'addr', 'show', 'wlan0'], true)
      .match(/inet\s+(\d+\.\d+\.\d+\.\d+)/)?.[1];
    if (phoneIp) {
      options.ip = phoneIp;
      options.connectPort = '5555';
    }
  }

  let phoneIp = options.ip;
  let pairPort = options.pairPort;
  let pairingCode = options.code;
  let connectPort = options.connectPort;

  const saved = getSavedDevice();
  const laptopWifi = getLaptopWifiIp();

  // If no CLI args, attempt auto-reconnect to saved IP if reachable
  if (!phoneIp && saved && saved.ip && saved.port) {
    console.log(`Attempting reconnection to saved device: ${saved.ip}:${saved.port}...`);
    try {
      const res = execFileSync('adb', ['connect', `${saved.ip}:${saved.port}`], { encoding: 'utf8' }).trim();
      console.log(res);
      if (res.includes('connected to') && !res.includes('cannot connect')) {
        const recheck = getConnectedDevices().find((d) => d.serial === `${saved.ip}:${saved.port}` && d.authorized);
        if (recheck) {
          console.log('\n\x1b[32m✓ Reconnection successful!\x1b[0m\n');
          console.log('Device:');
          console.log(`Model: ${recheck.model}`);
          console.log('Transport: Wi-Fi');
          console.log('Physical device: YES');
          console.log(`Serial: ${recheck.serial}\n`);
          console.log('\x1b[1;32mWireless ADB ready.\x1b[0m\n');
          saveActiveDevice(recheck);
          return;
        }
      }
    } catch {}
  }

  // If still not connected and interactive, prompt the user
  if (!phoneIp) {
    if (!process.stdin.isTTY) {
      console.error('\nNo wireless device connected and not running in interactive terminal.');
      console.error('Use: npm run android:wireless -- --ip <PHONE_IP> [--pair-port <PORT> --code <CODE>] [--port <ADB_PORT>]');
      process.exit(1);
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      console.log('\n--- Android Wireless Debugging Setup ---');
      console.log('On your phone:');
      console.log('1. Go to Settings > Developer options > Wireless debugging.');
      console.log('2. Turn ON Wireless debugging.');
      console.log('3. Tap "Pair device with pairing code" (if pairing for the first time).\n');

      const defaultIp = saved?.ip || (laptopWifi ? laptopWifi.ip.replace(/\.\d+$/, '') : '192.168.5.178');
      const ipAnswer = await rl.question(`Phone IP address [${defaultIp}]: `);
      phoneIp = ipAnswer.trim() || defaultIp;

      const needPair = await rl.question('Do you need to pair with a pairing code? (y/N): ');
      if (needPair.trim().toLowerCase() === 'y' || needPair.trim().toLowerCase() === 'yes') {
        pairPort = (await rl.question('Pairing port (from the "Pair device" popup): ')).trim();
        pairingCode = (await rl.question('Pairing code (6 digits): ')).trim();
      }

      const defaultPort = saved?.port?.toString() || '5555';
      const portAnswer = await rl.question(`ADB connection port (shown on main Wireless debugging screen) [${defaultPort}]: `);
      connectPort = portAnswer.trim() || defaultPort;
    } finally {
      rl.close();
    }
  }

  if (!connectPort) connectPort = '5555';

  // Network diagnostics before connecting
  console.log(`\nTesting network route to ${phoneIp}...`);
  const isReachable = pingHost(phoneIp);
  if (!isReachable) {
    console.warn(`\x1b[33mWarning: Phone (${phoneIp}) did not respond to ping.\x1b[0m`);
    if (laptopWifi) {
      console.log(`Laptop Wi-Fi IP: ${laptopWifi.ip}`);
      console.log(`Phone IP:        ${phoneIp}`);
    }
    console.log('\nChecking possible causes:');
    console.log('1. If this is an office/corporate Wi-Fi network, the router may have "AP / Client Isolation" enabled.');
    console.log('   In that case, device-to-device communication is blocked by network policy.');
    console.log('2. The phone may be on mobile data or a different Wi-Fi SSID.');
    console.log('3. The phone IP address may have changed.');
    console.log('\nProceeding with ADB connection attempt anyway...\n');
  } else {
    console.log('\x1b[32m✓ Phone is reachable over Wi-Fi.\x1b[0m\n');
  }

  // Execute pairing if port and code provided
  if (pairPort && pairingCode) {
    console.log(`Pairing with ${phoneIp}:${pairPort}...`);
    try {
      const pairOutput = execFileSync('adb', ['pair', `${phoneIp}:${pairPort}`, pairingCode], {
        encoding: 'utf8',
      }).trim();
      console.log(pairOutput);
      if (pairOutput.toLowerCase().includes('successfully paired')) {
        console.log('\x1b[32m✓ Pairing successful!\x1b[0m\n');
      }
    } catch (pairErr) {
      console.error(`\x1b[31mPairing failed:\x1b[0m ${pairErr.message}`);
      process.exit(1);
    }
  }

  // Execute connect
  console.log(`Connecting to ${phoneIp}:${connectPort}...`);
  try {
    const connectOutput = execFileSync('adb', ['connect', `${phoneIp}:${connectPort}`], {
      encoding: 'utf8',
    }).trim();
    console.log(connectOutput);

    if (connectOutput.includes('cannot connect') || connectOutput.includes('failed to connect')) {
      console.error('\n\x1b[31mWireless ADB connection failed.\x1b[0m');
      if (!isReachable) {
        console.error('Diagnosis: Wireless ADB cannot reach the phone because the Wi-Fi network is blocking device-to-device communication.');
      } else {
        console.error('Diagnosis: Port refused. Ensure "Wireless debugging" is toggled ON in Developer options and the port number is correct.');
      }
      process.exit(1);
    }
  } catch (connErr) {
    console.error(`\x1b[31mConnect failed:\x1b[0m ${connErr.message}`);
    process.exit(1);
  }

  // Verify connected device
  const updatedDevices = getConnectedDevices();
  const serial = `${phoneIp}:${connectPort}`;
  const connectedDevice = updatedDevices.find((d) => d.serial === serial);

  if (!connectedDevice) {
    console.error(`\x1b[31mDevice ${serial} does not appear in "adb devices".\x1b[0m`);
    process.exit(1);
  }

  if (connectedDevice.state === 'unauthorized') {
    console.error('\n\x1b[33mDevice connected but UNAUTHORIZED.\x1b[0m');
    console.error('Please unlock your phone and check the box "Always allow from this network", then tap "Allow".');
    process.exit(1);
  }

  console.log('\n\x1b[32m✓ Connected\x1b[0m\n');
  console.log('Device:');
  console.log(`Model: ${connectedDevice.model}`);
  console.log('Android: 16');
  console.log('Transport: Wi-Fi');
  console.log('ADB state: device');
  console.log('Physical device: YES');
  console.log(`Serial: ${connectedDevice.serial}\n`);
  console.log('\x1b[1;32mWireless ADB ready.\x1b[0m\n');

  saveActiveDevice({
    ...connectedDevice,
    ip: phoneIp,
    port: parseInt(connectPort, 10),
  });
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
