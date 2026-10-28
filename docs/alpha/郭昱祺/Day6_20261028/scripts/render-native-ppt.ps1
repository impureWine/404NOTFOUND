param([Parameter(Mandatory=$true)][string]$Deck, [Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$deckPath = (Resolve-Path -LiteralPath $Deck).Path
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
$app = $null
$presentation = $null
try {
    $app = New-Object -ComObject PowerPoint.Application
    $presentation = $app.Presentations.Open($deckPath, -1, 0, 0)
    $slides = $presentation.Slides.Count
    $presentation.Export($outputPath, 'PNG', 1280, 720)
    Write-Output "Rendered $slides slides using Microsoft PowerPoint: $outputPath"
} finally {
    if ($null -ne $presentation) { $presentation.Close(); [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) }
    if ($null -ne $app) {
        if ($app.Presentations.Count -eq 0) { $app.Quit() }
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($app)
    }
    [GC]::Collect()
}
