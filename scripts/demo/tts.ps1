# Speak every narration step into a WAV with the built-in Windows voice (SAPI).
param([string]$Plan = "scripts/demo/narration.json", [string]$OutDir = "media/narration", [string]$Voice = "Microsoft Irina Desktop", [int]$Rate = 0)
Add-Type -AssemblyName System.Speech
$steps = Get-Content -Raw -Encoding UTF8 $Plan | ConvertFrom-Json
New-Item -ItemType Directory -Force $OutDir | Out-Null
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice($Voice)
$synth.Rate = $Rate
foreach ($step in $steps) {
  $path = Join-Path $OutDir ($step.id + ".wav")
  $synth.SetOutputToWaveFile($path)
  $synth.Speak($step.text)
  $synth.SetOutputToNull()
  Write-Output ("spoken " + $step.id)
}
$synth.Dispose()
