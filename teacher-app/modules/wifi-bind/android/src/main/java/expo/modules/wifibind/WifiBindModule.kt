package expo.modules.wifibind

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// The school Wi-Fi often has no internet. When mobile data is on, Android then
// sends the app's traffic over mobile data, even to addresses on the Wi-Fi,
// so the CAS School Server can't be reached. bind() routes this app's traffic
// through the Wi-Fi until unbind(); the rest of the phone is not affected.
class WifiBindModule : Module() {
  private val cm: ConnectivityManager
    get() = (appContext.reactContext ?: throw Exceptions.ReactContextLost())
      .getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

  private fun wifiNetwork(): Network? {
    @Suppress("DEPRECATION")
    return cm.allNetworks.firstOrNull { n ->
      val caps = cm.getNetworkCapabilities(n)
      caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("WifiBind")

    // True when the phone is on a Wi-Fi network at all.
    Function("hasWifi") { wifiNetwork() != null }

    // Route this app through the Wi-Fi. Returns false when there is no Wi-Fi.
    Function("bind") {
      val n = wifiNetwork() ?: return@Function false
      cm.bindProcessToNetwork(n)
    }

    // Back to Android's normal choice (mobile data or Wi-Fi with internet).
    Function("unbind") {
      cm.bindProcessToNetwork(null)
      true
    }

    Function("isBound") { cm.boundNetworkForProcess != null }
  }
}
