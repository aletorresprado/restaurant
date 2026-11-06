param([Parameter(Mandatory = $true)][string]$Email)

$ErrorActionPreference = 'Stop'
$previousEmail = $env:LOCAL_RESET_EMAIL
$previousPassword = $env:LOCAL_RESET_PASSWORD
$passwordPointer = [IntPtr]::Zero
$passwordInput = $null

try {
    Write-Host "Restablecer contrasena local de: $Email"
    $passwordInput = Read-Host 'Nueva contrasena: minimo 8 caracteres, una mayuscula y un numero' -AsSecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordInput)
    $env:LOCAL_RESET_EMAIL = $Email
    $env:LOCAL_RESET_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    Push-Location (Join-Path $PSScriptRoot '../apps/api')
    try {
        & node scripts/reset-local-password.cjs
        if ($LASTEXITCODE -ne 0) { throw 'No se cambio la contrasena. Revisa los requisitos indicados.' }
    } finally { Pop-Location }
} finally {
    if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
    if ($null -ne $passwordInput) { $passwordInput.Dispose() }
    $env:LOCAL_RESET_EMAIL = $previousEmail
    $env:LOCAL_RESET_PASSWORD = $previousPassword
}
