@echo off

set /p IP="Masukkan IP Address: "

netsh interface ipv4 set address name="Ethernet" static %IP% 255.255.255.0 192.168.1.1


echo.
echo IP berhasil diubah menjadi %IP%
pause