@echo off
REM ============================================================
REM  Publica A Plus Auto Center
REM
REM  OJO: desde el 16-sep-2026 quien sirve esta web es GitHub
REM  Pages, NO Cloudflare. Por eso este .bat hace "git push" y
REM  ya no "wrangler pages deploy": si se desplegara a Cloudflare
REM  los cambios NO se verian en el enlace bueno.
REM
REM  Enlace bueno: https://aplus.creskio.com
REM ============================================================
cd /d "E:\Escritorio\Agencia Webs IA\taller utah"

echo.
echo  Publicando A Plus Auto Center
echo  --------------------------------------------
echo.

git add -A
git diff --cached --quiet && (echo  No hay ningun cambio que publicar. & pause & exit /b 0)

set "MSG="
set /p MSG=  Que has cambiado (una linea):
if "%MSG%"=="" set "MSG=Actualizar la web"

git commit -m "%MSG%"
if errorlevel 1 (echo. & echo  Fallo el commit, no se ha subido nada. & pause & exit /b 1)

git push origin main
if errorlevel 1 (echo. & echo  Fallo el push. Revisa la conexion y vuelve a intentarlo. & pause & exit /b 1)

echo.
echo  Listo. En menos de un minuto se ve en:
echo     https://aplus.creskio.com
echo.
echo  Si has tocado functions\api\chat.js (el texto del bot),
echo  hace falta ADEMAS actualizar su cerebro:
echo.
echo     cd worker-chat
echo     npx wrangler deploy
echo.
pause
