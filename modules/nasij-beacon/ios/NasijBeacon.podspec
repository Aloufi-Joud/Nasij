Pod::Spec.new do |s|
  s.name           = 'NasijBeacon'
  s.version        = '1.0.0'
  s.summary        = 'Warns the family when a bracelet leaves range while the phone is locked'
  s.author         = 'Nasij'
  s.homepage       = 'https://github.com/Aloufi-Joud/Nasij'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
