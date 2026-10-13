// Locked-phone warning: the bracelet also broadcasts an iBeacon (team UUID, major 1, minor = last 4 hex digits
// of its MAC). iOS watches those regions even when the app is in the background or closed, and wakes us when one is left.
import CoreLocation
import ExpoModulesCore
import UserNotifications

private let braceletUUID = UUID(uuidString: "C4945856-6071-418B-845D-47040C4988CD")!
private let messagesKey = "nasijBeaconMessages"

final class BeaconWatcher: NSObject, CLLocationManagerDelegate {
  static let shared = BeaconWatcher()
  private let manager = CLLocationManager()

  private override init() {
    super.init()
    manager.delegate = self
  }

  // messages: bracelet MAC → notification text. Empty stops watching.
  func watch(_ messages: [String: String]) {
    UserDefaults.standard.set(messages, forKey: messagesKey) // read again if iOS relaunches the app for an exit
    for region in manager.monitoredRegions where messages[region.identifier] == nil {
      manager.stopMonitoring(for: region)
    }
    if messages.isEmpty { return }
    manager.requestAlwaysAuthorization()
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    for mac in messages.keys {
      guard let minor = UInt16(mac.suffix(4), radix: 16) else { continue }
      let region = CLBeaconRegion(uuid: braceletUUID, major: 1, minor: minor, identifier: mac)
      region.notifyOnEntry = true
      region.notifyOnExit = true
      manager.startMonitoring(for: region)
    }
  }

  func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
    // While the app is on screen it shows its own "are they with you?" prompt
    guard UIApplication.shared.applicationState != .active,
          let text = (UserDefaults.standard.dictionary(forKey: messagesKey) as? [String: String])?[region.identifier]
    else { return }
    let content = UNMutableNotificationContent()
    content.title = "نسيج"
    content.body = text
    content.sound = .default
    UNUserNotificationCenter.current().add(
      UNNotificationRequest(identifier: region.identifier, content: content, trigger: nil))
  }

  // Back in range: take the warning off the lock screen
  func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
    UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [region.identifier])
  }
}

public class NasijBeaconModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NasijBeacon")

    AsyncFunction("watch") { (messages: [String: String]) in
      BeaconWatcher.shared.watch(messages)
    }.runOnQueue(.main)
  }
}

// iOS may relaunch a closed app in the background for a region exit: the delegate must exist before JS loads
public class NasijBeaconLaunch: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    _ = BeaconWatcher.shared
    return true
  }
}
