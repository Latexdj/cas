// Keeps only the ARM native code in the APK. Android phones and tablets are
// ARM; the x86 code (for PC emulators) added about 35 MB to every download
// over the school Wi-Fi. "buildArchs" in expo-build-properties limits what is
// compiled, but ready-made libraries (the barcode scanner) still carry all
// four, so the build filters them here.
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withArmOnly(config) {
  return withAppBuildGradle(config, (cfg) => {
    const g = cfg.modResults.contents;
    if (!g.includes('abiFilters "armeabi-v7a", "arm64-v8a"')) {
      cfg.modResults.contents = g.replace(/defaultConfig\s*\{/, (m) => `${m}\n        ndk { abiFilters "armeabi-v7a", "arm64-v8a" }`);
    }
    return cfg;
  });
};
