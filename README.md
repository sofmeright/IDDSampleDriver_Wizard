Kai of <a href="https://precisionplanit.com">PrecisionPlanIT.com</a> presents:

# ![Virtual_Display_Wizard](https://gitlab.prplanit.com/uploads/-/system/project/avatar/42/app.png?width=26) Virtual Display Wizard
> A GUI tool that can integrate with other software such as Sunshine for efficient manipulation (Install / Uninstall / Reload / Configure) of Indirect Display Driver Sample (IddSample) implementations like the HDR capable <a href="https://github.com/itsmikethetech/Virtual-Display-Driver">Virtual Display Driver from itsmikethetech</a> that works on Windows 10/11. This installer/configuration tool is intended to provide a more elegant solution in place of needing to edit configs or use Device Manger for driver installation.


<img src="https://github.com/sofmeright/IDDSampleDriver_Wizard/blob/main/PPIT-IddSample_Wiz-SS_GUI_Advanced.png" width="300" />

### How did we get here:
> I use the Virtual Display Driver in my [workstation setup](http://sh.uni2.cc/28JLJ) and at a point I wondered how hard it would be to make a GUI for the driver and in turn I had to figure out how hard it was to finish my thought.
> I'm sharing this because I am typically a leecher and not a seeder. I use a lot of open source products in my workflow but do not often contribute. I'd be tickled if anyone gets use of this even if its only a drop-in-the-bucket.

### Features:
- Sunshine Integration - Automatic resolution adding / switching to the clients set [width x height x hz] with combination of sunshine commands and qres. Set and FORGET.
- Driver (Install / Uninstall / Reload) - Note: Reload has been useful, in my experience using Sunshine; reload did not cause the active session to terminate and refreshed changes.
- Monitor(s) (Set # of) - Adjusting the amount of virtual displays the driver is providing.
- RenderingEngine(GPU) (*Detection* & Selection)
- Resolutions (Adding / Removing)
- Resolutions (Grouping of Resolutions) - Resolution enteries containing the same [width x hight] are sorted by the earliest occurence of that specific [w x h] in the list. ~ This is done so they are in grouped entries when we write out the XML config.
- Priority (Changing) - (See: What is priority? in [Notes / Hints])
- Configs (Reading / Writing) - Reads and Writes both config formats (.txt & .xml).
- Configs (Conversion) - Efficiently converts between the xml and text config formats, via injecting them as decribed in [Notes / Hints].
- Configs (Default) - Pushes the properly named configs from the scripts folder to the C:\IddSampleDriver if not already there.
- Backups (Save/Load/Inject) - User can Save/Load (User Named) Backups of the .txt & .xml based configs into a Backups folder directly from the GUI. These can also be manipulated in their folder directly (See [Notes / Hints] for further instructions).
> Note: Additional features such as an Interactive Installer are planned. These features have been considered prior to creation of the tool and the design philosophy allows for ease of implementation.

### CMD/CLI Arguements:
You can call the script/exe from a staging tool/sunshine with Admin Credentials ~ any process that loads it directly or a .bat that can call it. This will allow you to load initial settings or toggle install/uninstall/reload.
To use command line arguments with the script you will need to pipe it through Autohotkey first (otherwise directly after the .exe).
- Adding resolutions dynamically via sunshine (reloads the driver automagically). 
> cmd /C SunshineIntegration.bat %SUNSHINE_CLIENT_WIDTH% %SUNSHINE_CLIENT_HEIGHT% %SUNSHINE_CLIENT_FPS%
- Install / Uninstall / Reload the driver.
> VirtualDisplayDrv.exe [Driv_Inst / Driv_Unin / Driv_Relo]
- Load/Save/Remove Backup entries for the given name (in quotes if it contains spaces).
> VirtualDisplayDrv.exe [Back_Load / Back_Save / Back_Remo] \<Name\>
- Sets the number of monitors
> VirtualDisplayDrv.exe Moni_Sets \<integer\>
- Sets the GPU to the given GPU name or if an integer by the GPU Detection number (in quotes if it contains spaces).
> VirtualDisplayDrv.exe GPUs_Sets \<String or integer\> 
- When a string is passed in containing %width% %hight% %Refresh% it adds it to the top of the list (even if it already exists).
> VirtualDisplayDrv.exe [Reso_Adds / Reso_Remo] \<WIDTH\> \<HEIGHT\> \<Hz\> 

# Installation:
1. Unpack the .exe or the .ahk source file. Note: If you wish to use the ".ahk" file (plain-text source code), you must install [Autohotkey](https://www.autohotkey.com).
2. Unpack the [Virtual Display Drivers](https://github.com/itsmikethetech/Virtual-Display-Driver) (or other IDDSample drivers) into the same folder.
3. Install the certificate.
4. Run the exe or script.
5. How to use it? Read the GUI, do stuff. There are some recommendations scattered throughout this ReadMe as well.

### Notes / Hints:
- At runtime it will load the vdd_settings.xml if present otherwise it will try to load adapter/option.txt. You can also replace/omit these accordingly at C:\IddSampleDriver if you want to workaround this very intended behavior.
- You can also place any config file with the script but in a folder "Backups" with the filename in the format "option.txt.[backup_title_here].backup", replace accordingly (vdd_settings.xml/option.txt/adapter.txt)
- You can name a backup whatever you like and place it manually and when you relaunch you can restore from it just as if you backed up from the GUI.
- But WHAT is *Priority*??? 🤷‍♀️ - I made it up ~ for the purpose of forcing a preferred [width x hight + Hz] to the top of the list. The resulting / only workable solution to accomplish this was a bit more robust than I initially desired (See: Features - Grouping of Resolutions), but nonetheless it resolves an issue I had with Immortals Fenyx Rising that may or may not affect other games or software. [HERE in the issues/solutions segement, I briefly describe the issue...](http://sh.uni2.cc/28JLJ)

### Integrating the tool with Sunshine:

<img src="https://github.com/sofmeright/IDDSampleDriver_Wizard/blob/main/PPIT-IddSample_Wiz-SS_Sunshine_Integration.png" width="300" />

The imporant and first one for this tool is:

> C:\IddSampleDriver\SunshineIntegration.bat %SUNSHINE_CLIENT_WIDTH% %SUNSHINE_CLIENT_HEIGHT% %SUNSHINE_CLIENT_FPS%

I also have these below, in case you are curious what the others are...

> "C:\_Staging\_Scripts\SoFMeRight\Run-Virtual_Here.ahk"

> cmd /C C:\_Staging\_Utilities\QRes.exe /X:%SUNSHINE_CLIENT_WIDTH% /Y:%SUNSHINE_CLIENT_HEIGHT% /R:%SUNSHINE_CLIENT_FPS%

- For some strange reason its possible to execute this with a .bat but not directly from Sunshine and it is not a syntax issue as we are passing the same syntax to a .bat.
- Make sure to check the config.elevated option, admin is needed for Driver Reloading, the tool will not run w/o elevation.
- Point the sunshine command to the SunshineIntegration.bat, then afterwards run qres to set the resolution and all your clients will automatically add any resolution that they request. There are [FOSS HDR togglers available](https://github.com/Nonary/AutoHDRSwitch) as well.

### Current Issues / Workarounds:
- AFAIK I haven't closed the issue that it requires reload of GUI to show new backups in the dropdown if another selection is made after Saving them.
- File writes/Priority Sorting is happening with out any loading screens. This is my preferred experience. However, due to this; if you change many things in swift sequence while it is writing or sorting ~ all the changes may not make it to the config if you close out without another change. If you make sure there is at least like 3-5 seconds between your last change you will be fine even if you go fast. (You can typically tell its updating ~ A file write occurs after that). CLI usage is unaffected. If it is bothersome I can add a loading screen in between writes, I resolved this already by simply hiding the GUI until its ready to change again, but I didn't like that. If this troubles you, raise an issue.
- You will have a generally good experience in the GUI, just be aware of this above limitation. Resolving this issue without changing the current feel of the application will take a entire recode of the way I am implementing the backend for resolutions entries, so it happens in memory rather than in the ListView. I did it this way as I thought it would be less lines of code and less redundancy of data. I did not expect these minor performance issues. It can be on the roadmap to resolve this minor caveot, especially if this tool becomes more adopted.
> Note: This software is essentially in beta. This is a quick and dirty tool by design. There is always that chance to find an issue I missed. I will encourage you to let me know if you find any bugs, I can't fix what I don't know is broke!

### Planned Features:
> Validation of the resolution fields of positive integers only so that jank can not be inserted into the list.
>
> Automatically selecting a default GPU when nothing is selected. Meant to add this already. Whoops!
> 
> Adding resolutions by pressing enter when (Wt x Ht + Hz) is filled out rather than by pressing a button.
>
> Automatically Unintalling/installing the certificate within the Driver Install/Uninstall flows.
> 
> A generic installer flow with options for users who do not want an Advanced tool and just want to get up and going.

### Dependencies / Requirements:
> This software configures the state of a few implementations of Microsofts Indirect Display Driver Sample, as such a compatible implementation is required; the one I test with is [the "Virtual Display Driver" from itsmikethetech](https://github.com/itsmikethetech/Virtual-Display-Driver) which is forked from [ge9's IddSampleDriver](https://github.com/ge9/IddSampleDriver), it will likely work other forks that share the same IddSampleDriver and *.inf name.

> The Driver Installation method I use is a mix of pnputils and [nefcon](https://github.com/nefarius/nefcon) developed by Nefarius. The executable for nefcon is shipped with the application, no need to install nefcon.

> This was written 100% with [Autohotkey](https://www.autohotkey.com), I first touched [Autohotkey](https://www.autohotkey.com) in 2010 or so. Why AutoHotkey? I determined in evaluating how hard it would be to do this that [Autohotkey](https://www.autohotkey.com) would allow me to have the fastest transition from having an idea to having a workable code. In every release there is a ".ahk" plain-text source file, that you can inspect and even make changes. If you install [Autohotkey](https://www.autohotkey.com) you will be able to execute the source code directly.

 >If you do not like AutoHotkey... You are most entitled to that opinion and encouraged to fork and port to something like Java or Python. Then I certainly will pull the changes, build a WebUI or do something as a token of gratitude & repect for your opinion. Otherwise as Deadpool said, MAXIMUM EFFORT!!! 🥴 AutoHotkey it is! 🤣

## Star History
[![Star History Chart](https://api.star-history.com/svg?repos=sofmeright/VirtualDisplayDriver_Wizard&type=Date)](https://www.star-history.com/#sofmeright/VirtualDisplayDriver_Wizard&Date)

# Shout Outs
- itsmikethetech ~ THANK YOU for your work on [the Virtual Display Driver](https://github.com/itsmikethetech/Virtual-Display-Driver/tree/0db50a948e4254733ae899b8e13f7517156ab7da)! HDR is something I was praying would get worked into Indirect Display Driver Sample for some time. I investigated this a few years back and it looked like so much work, I was like HECK-NO! The fact that you took the initiative to put forth the effort where many others such as myself did not, makes me all the more appreciative. It is a beautiful implemention and I can not fully express my gratitude. Without you, I would likely not have be using IDDSample at all!
- roshkins ~ Thank you for providing the [base implementation](https://github.com/roshkins/IddSampleDriver) of Microsofts Indirect Display Driver Sample! Without you there's no knowing where we would be today in terms of the current implementations.
- ge9 ~ Thank you for your continued work on the drivers within [your fork](https://github.com/ge9/IddSampleDriver) of the IDDSample implementation by roshkins.
- Nefarius ~ Thank you Nefarius (developer of [Nefcon](https://github.com/nefarius/nefcon), SCPToolkit, ViGEmBus for being so kind to explain how your tool works and extra thanks for offering to add support to make this easier! You are a rockstar and you inspire me! Thank you for everything you have done over the PAST TEN YEARS for the gaming community!
- The team at LizardByte ~ Thank you for giving me the motivation to bust out CMD/CLI to patch in a [Sunshine](https://github.com/LizardByte/Sunshine) integration, I didn't even realize how satisfying it would be until after I tested it! Thank you for all the kind words and advice! And more so thank you for making something trillions of times better than nvidia gamestream! I am very dependent on Sunshine/Moonlight! THANKS FOR MAKING MY Workstation Shenanigans *possible*!
- timminator ~ Thank you for your work on your fork of the [Virtual-Display-Driver](https://github.com/timminator/Virtual-Display-Driver) that includes an interactive installer! I originally implemented installation via DevCon but I was poking around and found your repo afaik its the only other Virtual Display Driver's with an executable installer. I saw the use of nefcon and it helped me get the motivation to remove devcon from this project though the syntax you were using didn't exactly work for me, I learned some things!
- Nonary/Codectory/anaisbetts ~ Thanks for your work to make an open source [HDR toggling code](https://github.com/Nonary/AutoHDRSwitch) available.
- JSRRosenbaum/Jezzick ~ Thank you for your contribution and feedback! You helped remove wmic from this project before it would be completely removed from Windows in an upcoming release and helped implement automatic driver downloading! Thank you for your kind words regarding this project as well! Great stuff!
- If you contributed in any way to this project or any of the above mentioned projects this software is relevant to I want to thank you for your contributions to the community! If you're not credited here it doesn't mean you're any less special! THANKS.

### Disclaimer: 
> The Software provided hereunder ("Software") is licensed "as-is," without warranties of any kind, express or implied. The Softwarer makes no representations regarding the functionality, performance, compatibility, security, or availability of the Software and no warranty. The developer should not be held responsible even if it blatantly be the cause of your dog running off and joining a circus, or your mother wins 5 tickets to Hawaii but you get stuck on a gaming bender and pass it up. The developer should not be held responsible if use of the Virual Display Driver causes you to spend longer hours on the PC and you muff up at your workplace. The developer should equally not be accredited with any responsibility for your experience using this software. All thanks is to those in development of the drivers and their forks, and the OpenSource communities! It's never been a better time than now to be a PC user!
