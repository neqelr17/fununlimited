<?php
include('../include/include.inc');
ob_start();
?>
<!--
// Fun Unlimited Online - Administration navigation menu
// All code copyright � 2003-2004 Scott Carpenter [s-carp@comcast.net]

// menu functions
var submenustatus = new Array();
var menucleartime = 2000;
var timer;

function dosubmenu(idx,cnt)
{
	//hidesubmenus(); // don't hide any open menus
	clearTimeout(timer);

	if (cnt)
	{
		var obj = document.getElementById('submenu'+idx).style;
		obj.display = (obj.display=='none'?'block':'none');
		submenustatus[(idx-1)] = obj.display;

		timer = setTimeout('hidesubmenus()',(menucleartime*2));
	}
}

function hidesubmenus()
{
	for (var i=0; i<submenustatus.length; i++)
	{
		var obj = document.getElementById('submenu'+(i+1)).style;
		obj.display = 'none';
		submenustatus[i] = 'none';
	}
}

function inmenu() { clearTimeout(timer); }
function outmenu() { timer = setTimeout('hidesubmenus()',menucleartime); }

// output the menu (generated by /scripts/navmenu.php)
<?php
$pg = new admin_page();
$pg->nav_menu();
?>

-->
<?php
$menu = ob_get_clean();

$f = fopen('navmenu.js','w');
fwrite($f,$menu);
fclose($f);
echo 'Wrote navmenu.js';
?>