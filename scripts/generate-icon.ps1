$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$recallRoot = Split-Path -Parent $PSScriptRoot
[System.IO.Directory]::CreateDirectory((Join-Path $recallRoot 'build')) | Out-Null
[System.IO.Directory]::CreateDirectory((Join-Path $recallRoot 'public')) | Out-Null
$bitmap = [System.Drawing.Bitmap]::new(256,256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)
$rounded = [System.Drawing.Drawing2D.GraphicsPath]::new()
$rounded.AddArc(0,0,100,100,180,90)
$rounded.AddArc(155,0,100,100,270,90)
$rounded.AddArc(155,155,100,100,0,90)
$rounded.AddArc(0,155,100,100,90,90)
$rounded.CloseFigure()
$brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#28755d'))
$graphics.FillPath($brush,$rounded)
$pen = [System.Drawing.Pen]::new([System.Drawing.Color]::White,12)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawBezier($pen,64,177,43,112,98,71,195,49)
$graphics.DrawBezier($pen,195,49,202,146,151,194,69,179)
$graphics.DrawBezier($pen,55,205,75,169,106,140,146,110)
$pngPath = Join-Path $recallRoot 'public\icon.png'
$bitmap.Save($pngPath,[System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
$iconStream = [System.IO.File]::Create((Join-Path $recallRoot 'build\icon.ico'))
$writer = [System.IO.BinaryWriter]::new($iconStream)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32)
$writer.Write([uint32]$pngBytes.Length); $writer.Write([uint32]22); $writer.Write($pngBytes)
$writer.Dispose(); $graphics.Dispose(); $bitmap.Dispose(); $brush.Dispose(); $pen.Dispose(); $rounded.Dispose()
Write-Output 'Generated RecallMate icon.png and icon.ico'
