# Kleiner lokaler Webserver zum Testen der Website, ohne Python oder Node.
# Aufruf:  powershell -ExecutionPolicy Bypass -File website\tools\serve.ps1   dann http://localhost:8080
param([int]$Port = 8080)

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$typen = @{ '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon' }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
"Website läuft auf http://localhost:$Port/ (Ordner $root)"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $pfad = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if (-not $pfad) { $pfad = 'index.html' }
  $datei = [IO.Path]::GetFullPath((Join-Path $root $pfad))
  if ($datei.StartsWith($root) -and (Test-Path $datei -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($datei)
    $typ = $typen[[IO.Path]::GetExtension($datei).ToLower()]
    if ($typ) { $ctx.Response.ContentType = $typ }
    $ctx.Response.Headers.Add('Cache-Control', 'no-store')
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.Close()
}
