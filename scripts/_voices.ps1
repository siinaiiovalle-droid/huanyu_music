Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
foreach ($v in $s.GetInstalledVoices()) {
  Write-Output ($v.VoiceInfo.Name + " [" + $v.VoiceInfo.Culture + "] " + $v.VoiceInfo.Gender)
}
