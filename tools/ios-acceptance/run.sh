#!/bin/zsh
# Generate the project and run the acceptance UI tests against the PawCue build installed on the booted simulator.
#   tools/ios-acceptance/run.sh [-only-testing:AcceptanceUITests/AcceptanceTests/testName]
set -e
cd "$(dirname "$0")"
cp ../../apps/mobile/PawCue.storekit Resources/PawCue.storekit
xcodegen generate --quiet
xcodebuild test -project PawCueAcceptance.xcodeproj -scheme AcceptanceUITests \
  -destination 'platform=iOS Simulator,id=C7B79175-4F9C-48DF-A861-29B49014782F' \
  -derivedDataPath /tmp/pawcue-acceptance "$@" 2>&1 | grep -E "A11Y |Test Case|error:|failed|passed|\*\* TEST"
