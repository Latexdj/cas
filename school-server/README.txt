CAS SCHOOL SERVER - SETUP GUIDE
================================

What it does
------------
The CAS School Server runs on one Windows PC on the school's network. Student
tablets on the school Wi-Fi get two things from it, with no internet needed:

  * new past questions for the Past Questions quiz (automatic)
  * new versions of the CAS Student app (the tablet offers "Install")

Whenever the PC has internet, the server fetches the latest past questions by
itself (every 30 minutes). Without internet, load them from a flash drive.


What you need
-------------
  * A Windows PC (Windows 10, 11 or Server) that stays on at school.
  * A router that hands out addresses to the tablets, with your Wi-Fi access
    points connected to it.
  * The CAS-School-Server folder (this folder).


Recommended network
-------------------

   [4G router with SIM]  (optional: internet when there is data)
            | cable into the main router's internet port
   [Main router] ---- cable ---- [School server PC]
       |      |
     cable  cable
       |      |
   [Access points]  <-- Wi-Fi -->  tablets

  * Connect the server PC to the main router with a CABLE, not Wi-Fi.
  * Tablets must join a Wi-Fi network that belongs to the same main router.
  * A business router such as a MikroTik is a good main router. A pocket
    mobile hotspot is too small for a whole school.


Step 1: Give the server PC a fixed address
------------------------------------------
Tablets remember the server's address, so it should never change.

Either, on the router (best):
  MikroTik (Winbox or WebFig): IP > DHCP Server > Leases, find the PC,
  open it and click "Make Static".

Or, on the PC:
  Settings > Network > Ethernet > IP assignment > Edit > Manual, IPv4 on.
  Use an address in the router's range that nothing else uses, for example
  192.168.88.10 with subnet mask 255.255.255.0 and the router's address
  (for example 192.168.88.1) as gateway and DNS.


Step 2: Install
---------------
  1. Copy this folder to the PC (for example to the Desktop).
  2. Right-click install.bat and choose "Run as administrator".
  3. The server's page opens in the browser: http://localhost:8787

The server now starts by itself whenever the PC starts. It is installed in
C:\CAS-School-Server. Running install.bat again updates the program and keeps
all loaded questions and apps.


Step 3: Load the past questions and the app
-------------------------------------------
On the server's page (http://localhost:8787 on the server PC):

  * Past questions: if the PC has internet, click "Check online now".
    Otherwise click "Load pack from file" and choose the .zip downloaded from
    CAS Super Admin > Past Questions > "Download pack for USB".
  * Student app: click "Load app from file" and choose the CAS Student .apk.

The page shows the address tablets use, for example 192.168.88.10:8787.


Step 4: Tablets
---------------
  * Each tablet needs the CAS Student app with school-server support
    (installed once by hand).
  * Connect the tablet to the school Wi-Fi and open the app. It finds the
    server by itself. Open Past Questions to see "Connected to the school
    server".
  * If a tablet does not find it: Past Questions > School server >
    Enter address, and type the address shown on the server's page.
  * When a newer app is on the server, the tablet shows a banner with
    "Install". Android asks once to allow installs from CAS Student; allow it.

"Tablets seen" on the server's page lists every tablet that has connected,
with its app and past-questions versions, so you can see which still need to
update.


Troubleshooting
---------------
  * Tablets can't find the server: check the tablet is on the school Wi-Fi
    (not mobile data or another hotspot) and that the PC is on and cabled to
    the main router. Some access points block devices from seeing each other
    ("client isolation" or "AP isolation"); turn that off.
  * The page says "No internet connection" under online check: normal when
    the PC is offline. Load the pack from a file instead.
  * To remove the server: right-click uninstall.bat > Run as administrator.
