param([string]$Jobs, [string]$OutDir, [string]$Voice)

Add-Type -AssemblyName System.Speech
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$items = (Get-Content -Raw -Encoding UTF8 $Jobs) | ConvertFrom-Json

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 0
$synth.Volume = 100
if ($Voice) {
  try { $synth.SelectVoice($Voice) } catch { Write-Output ("WARN_SELECT_VOICE: " + $Voice) }
}

$done = 0
foreach ($item in $items) {
  $out = Join-Path $OutDir ($item.id + '.wav')
  if (Test-Path $out) { Remove-Item $out -Force }
  $synth.SetOutputToWaveFile($out)
  if ($item.ssml) { $synth.SpeakSsml($item.ssml) } else { $synth.Speak($item.text) }
  $synth.SetOutputToNull()
  $done++
}
$synth.Dispose()
Write-Output ("DONE " + $done)
