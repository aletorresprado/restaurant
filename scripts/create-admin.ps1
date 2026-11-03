$ErrorActionPreference = 'Stop'
$previousEmail = $env:ADMIN_EMAIL
$previousPassword = $env:ADMIN_PASSWORD
$passwordPointer = [IntPtr]::Zero
$passwordInput = $null

try {
    $env:ADMIN_EMAIL = Read-Host 'Correo nuevo para el administrador (no debe existir como cliente)'
    $passwordInput = Read-Host 'Contrasena: minimo 8 caracteres, una mayuscula y un numero' -AsSecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordInput)
    $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    Push-Location (Join-Path $PSScriptRoot '../apps/api')
    try {
        & pnpm.cmd db:seed
        if ($LASTEXITCODE -ne 0) { throw 'No se creo el administrador. Revisa los requisitos y usa un correo que no exista.' }
        Write-Host 'Administrador creado. Ingresa a la app con ese correo y contrasena.'
    } finally {
        Pop-Location
    }
} finally {
    if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
    if ($null -ne $passwordInput) { $passwordInput.Dispose() }
    $env:ADMIN_EMAIL = $previousEmail
    $env:ADMIN_PASSWORD = $previousPassword
}
