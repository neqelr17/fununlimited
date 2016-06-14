// Functionality for Fun Unlimited Store Management Point-of-Sale Invoice
// All code copyright � 2003-2004 Scott Carpenter [s-carp@comcast.net]
// Version: 10/05/2012

// output the item info window
function iteminfo_window(itemID,focus_type)
{
	open_window('/admin/pos/iteminfo.php?itemID=' + itemID + '&isinvoice=' + YES + '&focus_type=' + focus_type,'iteminfo',725,500,'YES',true);
}

// output the customer printout window
function customer_printout()
{
	alert('This feature has been temporarily disabled.');
	/*
	if (trade_itemIDs.length) { open_window('/admin/pos/custprintout.php','custprint',725,500,'YES',true); }
	else { alert('There are no trade items on this invoice.'); }
	*/
}

// apply any modifiers to the price (box subtraction, on hand subtraction, etc)
// !!! ANYTHING CHANGED IN THIS FUNCTION NEEDS TO BE CHANGED IN /CLASSES/INVOICE.INC !!!
function apply_price_mods(type,x,idx,itemID,base,setlyr,forcash,skipqty)
{
	var platformID = (type==SALE ? sale_platformIDs[idx] : trade_platformIDs[idx]);
	var platform_idx = array_search(platformID,all_platformIDs);
	var mod_price = base;
	var check_minprice = true;
	var cont = true;
	var pricing_line = new Array();
	pricing_line[0] = 'Base|' + format_price(base) + '|' + base;

	if (type == TRADE) { trade_manual_price[idx] = 0; }

	// TRADE: apply cash/credit/neither
	if (type == TRADE)
	{
		var tt = trade_types[idx];
		if (tt == NEITHER)
		{
			mod_price = 0;
			check_minprice = false;
		}
		else
		{
			if (tt == CREDIT)
			{
				var perc = credit_percs[platform_idx];
				mod_price = (mod_price*(perc/100));
				pricing_line[pricing_line.length] = 'Percent|'+perc+'%'+'|'+mod_price;
			}
			else
			{
				// cash is 1/2 of credit - set the trade_type and obtain the credit price
				trade_types[idx] = CREDIT;
				mod_price = (apply_price_mods(type,x,idx,itemID,base,true,true,true)/2);
				trade_types[idx] = CASH;
				var cont = false;
			}
		}
	}

	if (cont)
	{
		// TRADE: apply per-copy discounts
		if (type == TRADE && mod_price > 0 && !in_array(itemID,non_percopy))
		{
			var pcd      = percopy[platform_idx];
			var pcd_perc = percopy_percent[platform_idx];
			if (pcd > 0)
			{
				var itmidx = array_search(itemID,qty_itemIDs);
				var tt = trade_types[idx];
				var ohqty = qty_total[itmidx];

				var dupeqty = 0; // don't subtract for the first item on the invoice (IE: first item = no discount, second = 1 copy discount, third = 2, etc...)
				for (var i=0; i<idx; i++)
				{
					if (trade_itemIDs[i] == itemID && trade_types[i] != NEITHER) { dupeqty++; }
				}

				if (qty_new_orig[itmidx] > 0) { var newqty = 1; }
				else { var newqty = 0; }
				var subqty = newqty + qty_used_orig[itmidx] + dupeqty;

				// calculate the amount to subtract
				var sub_amount = 0;
				if (pcd_perc)
				{
					// determine the amount that is the percentage of the whole price
					// IE: 10% per-copy, $10.00 base = $1.00 off per-copy
					sub_amount = (mod_price * (pcd / 100));
				}
				else
				{
					// dollar amount
					sub_amount = pcd;
				}

				var half = 0;
				for (var i=0; i<subqty; i++)
				{
					var after_mod = applyDiscount(mod_price,false,sub_amount);
					if (after_mod <= (mod_price / 2))
					{
						mod_price = (mod_price / 2);
						half = 1;
					}
					else
					{
						mod_price = after_mod;
					}
				}

				if (subqty)
				{
					pricing_line[pricing_line.length] = 'PerCopy|' + subqty + ' x -' + (!pcd_perc ? '$' : '') + format_price(pcd) + (pcd_perc ? '%' : '') + (!pcd_perc ? ' = -' + format_price(pcd * subqty) : '') + '|' + mod_price + '|' + half;
					pricing_line[pricing_line.length] = 'In-Stock New: ' + qty_new_orig[itmidx] + ' / Used: ' + qty_used_orig[itmidx] + '';
				}
			}
		}

		// SALE/TRADE: apply box discount (or 1/2 original, if needed)
		if (mod_price > 0 && (type == SALE || type == TRADE))
		{
			var boxarr = (type==SALE ? sale_box : trade_box);
			var box = boxarr[idx];
			var discount = 0;
			var do_perc = false;
			var half = 0;
			if (box != BOX)
			{
				var do_half = boxdohalf[platform_idx];

				var bdarr = eval((type==SALE ? 'sale' : 'trade') + '_box' + box + 'discount');
				var bdarr_perc = box_percent;
				discount = bdarr[platform_idx];
				do_perc  = bdarr_perc[platform_idx];

				var after_mod = applyDiscount(mod_price,do_perc,discount);
				if (do_half == true && after_mod < (mod_price / 2))
				{
					mod_price = (mod_price / 2);
					half = 1;
				}
				else
				{
					// apply the discount
					//mod_price = (mod_price - discount);
					mod_price = after_mod;
				}
			}

			if (discount > 0)
			{
				pricing_line[pricing_line.length] = 'Box|-' + (!do_perc ? '$' : '') + format_price(discount) + (do_perc ? '%' : '') + '|' + mod_price + '|' + half;
			}
		}

		// TRADE: apply condition discount
		if (type == TRADE && mod_price > 0)
		{
			var cond = trade_condition[idx];
			var discount = 0;
			var do_perc = false;
			var half = 0;
			if (cond != GOOD)
			{
				var condarr = eval('cond_' + (cond==FAIR ? 'fair' : (cond==POOR ? 'poor' : 'new')));
				var condarr_perc = cond_percent;
				discount = condarr[platform_idx];
				do_perc = condarr_perc[platform_idx];

				use_discount = (discount * (cond==CNEW ? -1 : 1)); // if negative, it is added (price minus a negative discount = added discount)
				var after_mod = applyDiscount(mod_price,do_perc,use_discount);
				if (after_mod < (mod_price / 2))
				{
					mod_price = (mod_price / 2);
					half = 1;

					// if the condition is poor, 1/2 again
					if (cond == POOR)
					{
						mod_price = (mod_price / 2);
						half = 2;
					}
				}
				else
				{
					// apply the discount
					mod_price = after_mod;
				}
			}
			//mod_price = (cond==CNEW ? (mod_price + discount) : (mod_price - discount));

			if (discount > 0)
			{
				pricing_line[pricing_line.length] = 'Condition|' + (cond==CNEW ? '+' : '-') + (!do_perc ? '$' : '') + format_price(discount) + (do_perc ? '%' : '') + '|' + mod_price + '|' + half;
			}
		}

		// SALE: subtract a percentage (if applicable)
		if (type == SALE && mod_price > 0)
		{
			mod_price = applyDiscount(mod_price,true,sale_percent[idx]);
			//var timesby = 1-(sale_percent[idx]/100);
			//mod_price *= timesby;
		}

		// SALE/TRADE: apply milestone discount/markup
		if (type == SALE && mod_price > 0)
		{
			var msd = sale_milestone[idx];
			var isd = msd.substring(0,1);
			var isp = msd.substring((msd.length-1),msd.length);

			if (isd == '$')
			{
				var num = msd.substring(1,msd.length);
				mod_price -= num;
			}
			else if (isp == '%')
			{
				var num = msd.substring(0,(msd.length-1));
				var timesby = 1-(num/100);
				mod_price *= timesby;
			}
		}
		else if (type == TRADE && mod_price > 0)
		{
			var msd = trade_milestone[idx];
			var isd = msd.substring(0,1);
			var isp = msd.substring((msd.length-1),msd.length);

			if (isd == '$')
			{
				var num = msd.substring(1,msd.length);
				mod_price += num;

				if (num != 0) { pricing_line[pricing_line.length] = 'Milestone|+'+format_price(num)+'|'+mod_price; }
			}
			else if (isp == '%')
			{
				var num = msd.substring(0,(msd.length-1));
				var timesby = 1+(num/100);
				mod_price *= timesby;

				if (num != 0) { pricing_line[pricing_line.length] = 'Milestone|+'+num+'%'+'|'+mod_price; }
			}
		}
	}

	// RETURNS: if new & unopened, give full purchase value back

	// RETURNS: if new & opened, see if past (purchase_price-used_price) days since purchase (IE: $50 new, $35 used, see if within 15 days)
	// if new & opened, price is automatically current used price (minus $1/day below if applicable)
	if (type == RETURNS && return_opened[idx] != BROKEN)
	{
		// RETURNS: if they have chosen cash for a used/opened item, give them the normal cash trade value
		if (return_types[idx] == CASH && return_newused[idx] == ITEM_USED && return_opened[idx] == OPENED)
		{
			mod_price = return_cash_prices[idx];
		}
		else
		{
			var in_first = false;
			if (return_opened[idx] == OPENED)
			{
				if (return_occasion[idx] == NONE)
				{
					if (return_newused[idx] == ITEM_NEW)
					{
						price_diff = (Math.round(return_purchprices[idx]) - Math.round(return_used_prices[idx]));
						days_diff = daysBetween(return_purchdates[idx],'now',false);
						if (price_diff >= days_diff) { in_first = true; }
					}
					else if (return_newused[idx] == ITEM_USED)
					{
						price_diff = 0;
						days_diff = daysBetween(return_purchdates[idx],'now',false);
					}
				}
				else
				{
					/*
					Special occasion discounts:
					- popup box and ask for date (popped up when occasion clicked)
					- don't subtract for that day/those days
					- if date is Saturday, Monday doesn't count (it becomes their first day)

					For birthdays, the default date in the popup is today
					For Christmas, the default date in the popup is Christmas

					Get difference between today and occdate
					if Birthday, subtract 1
					if Christmas, subtract 7
					*/
					var occdate = return_occasion_date[idx];
					if (occdate != '')
					{
						var d = new Date(occdate);
						var days_diff = daysBetween((d.getTime()/1000),'now',false);
						var alrt = 'days between today and '+occdate+': '+days_diff;
						if (return_occasion[idx] == BIRTHDAY) { days_diff -= 1; }
						else if (return_occasion[idx] == CHRISTMAS) { days_diff -= 7; }
					}
					price_diff = 0;
				} // else occasion

				mod_price = (in_first ? return_used_prices[idx] : return_purchprices[idx]);
			}

			if (typeof(days_diff) == 'undefined' || typeof(price_diff) == 'undefined') { var days_diff = 0; var price_diff = 0; }

			if (days_diff < 0) { days_diff = 0; }

			//if (typeof(alrt) == 'undefined') { alrt = ''; } else { alrt += '\n'; }
			//alert(alrt+'subtract: '+days_diff);

			// RETURNS: take off $1 per-day, if applicable
			if (!in_first)
			{
				mod_price -= (days_diff-price_diff);

				// if mod_price is less than credit value, set to credit value
				if (mod_price < return_credit_prices[idx]) { mod_price = return_credit_prices[idx]; }
			}
		}

		// RETURNS: if the item is used/new, opened, and not for a special occasion, make sure at least $1 is subtracted
		if (return_occasion[idx] == NONE && (return_newused[idx] == ITEM_USED || (return_newused[idx] == ITEM_NEW && (return_opened[idx] == OPENED || return_opened[idx] == BROKEN))) && mod_price == return_purchprices[idx])
		{
			mod_price -= 1;
		}
	}

	// RETURNS: if_applicable, subtract credit card charge percentage (round up to next-highest dollar amount)
	var sub_charged = false;
	if (type == RETURNS && return_charged[idx] == YES)
	{
		if (return_opened[idx] == BROKEN && return_types[idx] == CASH) { sub_charged = true; }
		else if (return_opened[idx] == UNOPENED && return_newused[idx] == ITEM_NEW && return_types[idx] == CASH) { sub_charged = true; }
		else if (return_opened[idx] == UNOPENED && return_newused[idx] == ITEM_NEW && return_types[idx] == CREDIT) { sub_charged = false; }
		else if (return_opened[idx] != BROKEN) { sub_charged = true; }
	}
	if (sub_charged)
	{
		subperc = sto_charge_perc;
		if (subperc > 0)
		{
			mod_price -= Math.ceil((subperc/100)*mod_price);
		}
	}

	// check minimum price
	if (check_minprice == true)
	{
		var minp = min_price[platform_idx];
		if (mod_price < minp)
		{
			mod_price = minp;

			pricing_line[pricing_line.length] = 'MinPrice|='+format_price(minp)+'|'+mod_price;
		}
	}

	if (mod_price < 0) { mod_price = 0; }

	//alert(type+', '+idx+', '+itemID+', '+base+', '+setlyr+', '+forcash+', '+skipqty+' = '+mod_price);
	if (type == TRADE)
	{
		var qty = trade_invoice_qtys[idx];
		var setmod = format_price(round_cents(mod_price))*(!skipqty?qty:1);

		if (forcash)
		{
			// subtract 1/2 of credit amount after rounding
			var mod_price = format_price(mod_price);
			var rounded = format_price(round_cents(mod_price));
			if (mod_price != rounded)
			{
				var off = format_price(mod_price-rounded);
				if (off > 0) { off = '-'+format_price(off); } else { off = '+'+format_price(off*-1); }
				pricing_line[pricing_line.length] = 'Round|'+off+'|'+rounded;
			}
			mod_price = rounded;
			var orig = format_price(mod_price);

			mod_price = format_price(mod_price/2);
			pricing_line[pricing_line.length] = '1/2Credit|-'+format_price(orig-mod_price)+'|'+mod_price;
		}

		//if (type == TRADE && !x) { alert('mp: '+mod_price+'\nformat: '+format_price(mod_price)+'\nround: '+round_cents(mod_price)); }
		var mod_price = format_price(mod_price);
		var rounded = format_price(round_cents(mod_price));
		if (mod_price != rounded)
		{
			var off = format_price(mod_price-rounded);
			if (off > 0) { off = '-'+format_price(off); } else { off = '+'+format_price(off*-1); }
			pricing_line[pricing_line.length] = 'Round|'+off+'|'+rounded;
		}
		mod_price = rounded;

		if (trade_types[idx] != CASH && !skipqty)
		{
			// times mod_price by the item's quantity
			if (qty > 1)
			{
				mod_price = format_price(mod_price)*qty;
				pricing_line[pricing_line.length] = 'Qty|x '+qty+'|'+mod_price;
			}

			pricing_line[pricing_line.length] = 'Final||'+mod_price;
		}
		else
		{
			var show_price = mod_price*qty;
			if (qty > 1) { pricing_line[pricing_line.length] = 'Qty|x '+qty+'|'+show_price; }
			pricing_line[pricing_line.length] = 'Final||'+show_price;
		}

		if (setlyr)
		{
			if (trade_types[idx] != NEITHER && temptype != NEITHER) { pricing_lines[idx] = format_pricing_lines(pricing_line,idx); }
			else
			{
				pricing_line = new Array('No Price - <b>Neither</b> Selected');
				pricing_lines[idx] = format_pricing_lines(pricing_line,idx);
			}
		}

		mod_price = setmod;
	} // if trade
	else
	{
		// times mod_price by the item's quantity
		if (type == SALE) { var qty = sale_invoice_qtys[idx]; }
		else if (type == RETURNS)
		{
			if (mod_price != return_purchprices[idx]) { mod_price = round_cents(mod_price); }
			var qty = return_invoice_qtys[idx];
		}
		mod_price = (format_price(mod_price) * qty);
	}

	return format_price(mod_price);
}

/**
* Apply a dollar/percent discount
* @param	float	$price
* @param	boolean	$do_percent
* @param	float	$amount
* @return	float
* @access	public
*/
function applyDiscount(price,do_percent,amount)
{
	if (amount == 0)
	{
		return price;
	}
	if (do_percent)
	{
		return (price * (1 - (amount / 100)));
	}
	else
	{
		return (price - amount);
	}
} // end function applyDiscount

function round_cents(price)
{
	price = format_price(price);
	if (price >= 1) { price = Math.round(price); }
	else
	{
		if (price >= 0.75) { price = 0.75; }
		else if (price >= 0.5) { price = 0.5; }
		else if (price >= 0.25) { price = 0.25; }
		else if (price >= 0.1) { price = 0.1; }
		else if (price >= 0.05) { price = 0.05; }
		else { price = 0.01; }
	}

	return price;
}

// change new/used
function change_newused(type,x,idx,image,linkID,chgto,itemID)
{
	var canchange = false;

	if (type == SALE)
	{
		if (sale_newused[idx] != chgto)
		{
			var itmidx = array_search(itemID,qty_itemIDs);

			if (chgto == ITEM_NEW && qty_new[itmidx] > 0)
			{
				canchange = true;
				qty_used[itmidx]++;
				qty_new[itmidx]--;
			}
			else if (chgto == ITEM_USED && qty_used[itmidx] > 0)
			{
				canchange = true;
				qty_used[itmidx]--;
				qty_new[itmidx]++;
			}
			else
			{
				alert('There are no ' + (chgto==ITEM_NEW ? 'new' : 'used') + ' copies of this item on hand at this time.');
				ask_force(idx,'this item',SALE,itemID);
			}
		}
	}
	else if (type == RETURNS)
	{
		// always accept new/used changes for returns
		canchange = true;
	}

	if (canchange)
	{
		if (type == SALE)
		{
			sale_newused[idx] = chgto;
			var base_price = (chgto==ITEM_NEW ? sale_new_prices[idx] : sale_used_prices[idx]);
		}
		else if (type == RETURNS)
		{
			return_newused[idx] = chgto;
			var base_price = return_purchprices[idx];
		}

		var new_price = apply_price_mods(type,x,idx,itemID,base_price);

		post_data(type,idx,'ini_newused|ini_price',chgto+'|'+new_price);
		change_image(linkID,image);
		change_price(type,idx,new_price);
	}

	hide_layer();
	clearSearch(type);
}

// change cash/credit/neither
function change_ccn(type,x,idx,image,linkID,chgto,itemID,dopost,noupdate)
{
	var changed = true;
	var figure_price = true;

	if (type == TRADE)
	{
		if (trade_types[idx] != chgto)
		{
			trade_types[idx] = chgto;
			figure_price = false;
			var new_price = (trade_types[idx]==CASH?trade_cash_prices[idx]:trade_credit_prices[idx]);
			var base_price = trade_used_prices[idx];
		}
		else { changed = false; }
	}
	else if (type == RETURNS)
	{
		if (return_types[idx] == chgto) { changed = false; }
		/* ALWAYS USE PURCHASE PRICE
		else if (chgto == CASH)
		{
			return_types[idx] = chgto;
			if ((return_newused[idx] == ITEM_NEW && return_opened[idx] == UNOPENED) || return_opened[idx] == BROKEN)
			{
				var base_price = return_purchprices[idx];
			}
			else
			{
				var base_price = return_cash_prices[idx];
			}
		}
		else if (chgto == CREDIT)
		{
			return_types[idx] = chgto;
			var base_price = ((return_newused[idx]==ITEM_NEW&&return_opened[idx]==UNOPENED)||return_opened[idx]==BROKEN?return_purchprices[idx]:return_used_prices[idx]);
		}
		*/
		else
		{
			return_types[idx] = chgto;
			var base_price = return_purchprices[idx];
		}
	}

	if (changed)
	{
		if (figure_price) { var new_price = apply_price_mods(type,x,idx,itemID,base_price); }

		if (dopost == true) { post_data(type,idx,'ini_price_manual|ini_trade_type|ini_price','0|'+chgto+'|'+new_price); }
		change_image(linkID,image);
		change_price(type,idx,new_price,noupdate);
	}

	hide_layer();
	clearSearch(type);
}

// change condition (new/good/fair/poor)
function change_gfp(type,x,idx,image,linkID,chgto,itemID)
{
	if (trade_condition[idx] != chgto)
	{
		trade_condition[idx] = chgto;

		var base_price = trade_used_prices[idx];
		var new_price = apply_price_mods(type,x,idx,itemID,base_price);

		post_data(type,idx,'ini_price_manual|ini_condition|ini_price','0|'+chgto+'|'+new_price);
		change_image(linkID,image);
		change_price(type,idx,new_price);
	}

	hide_layer();
	clearSearch(type);
}

// change box/no box/store printed box
function change_box(type,x,idx,image,linkID,chgto,itemID)
{
	var changed = false;

	if (type == SALE && sale_box[idx] != chgto)
	{
		changed = true;
		sale_box[idx] = chgto;
	}
	else if (type == TRADE && trade_box[idx] != chgto)
	{
		changed = true;
		trade_box[idx] = chgto;
	}

	if (changed)
	{
		if (type == SALE)
		{
			var base_price = (sale_newused[idx]==ITEM_NEW ? sale_new_prices[idx] : sale_used_prices[idx]);
		}
		else
		{
			var base_price = trade_used_prices[idx];
		}
		var new_price = apply_price_mods(type,x,idx,itemID,base_price);

		post_data(type,idx,'ini_price_manual|ini_box|ini_price','0|'+chgto+'|'+new_price);
		change_image(linkID,image);
		change_price(type,idx,new_price);

		var change_img = false;
		if (type == SALE)
		{
			image = (chgto==NOBOX ? sale_images_nobox[idx] : sale_images_box[idx]);
			if (!image.length && sale_images_box[idx].length)
			{
				image = sale_images_box[idx];
			}
			change_img = true;
		}
		else if (type == TRADE)
		{
			image = (chgto==NOBOX ? trade_images_nobox[idx] : trade_images_box[idx]);
			if (!image.length && trade_images_box[idx].length)
			{
				image = trade_images_box[idx];
			}
			change_img = true;
		}

		if (change_img)
		{
			change_item_image(type, idx, image);
		}
	}

	hide_layer();
	clearSearch(type);
}

// change opened status (opened/unopened)
function change_open(type,x,idx,image,linkID,chgto,itemID)
{
	return_opened[idx] = chgto;

	var base_price = return_purchprices[idx];
	var new_price = apply_price_mods(type,x,idx,itemID,base_price);

	post_data(type,idx,'ini_price_manual|ini_opened|ini_price','0|'+chgto+'|'+new_price);
	change_image(linkID,image);
	change_price(type,idx,new_price);
	hide_layer();
	clearSearch(type);
}

// change charged status (charged/not charged)
function change_charged(type,x,idx,image,linkID,chgto,itemID)
{
	if (return_charged[idx] != chgto)
	{
		return_charged[idx] = chgto;

		var base_price = return_purchprices[idx];
		var new_price = apply_price_mods(type,x,idx,itemID,base_price);

		post_data(type,idx,'ini_price_manual|ini_return_charged|ini_price','0|'+chgto+'|'+new_price);
		change_image(linkID,image);
		change_price(type,idx,new_price);
	}

	hide_layer();
	clearSearch(type);
}

// change special occasion (none/Birthday/Christmas)
function change_occasion(type,x,idx,image,linkID,chgto,itemID)
{
	var d = new Date();
	var today = date_format('m/d/Y');
	var thisYear = d.getFullYear();
	var christmas = '12/25/'+(d.getMonth()==11?d.getFullYear():(d.getFullYear()-1));
	var word = (chgto==CHRISTMAS?'Christmas':'birthday');

	var from = return_occasion[idx];
	var occdate = return_occasion_date[idx];
	var do_change = true;

	if (chgto == NONE) { occdate = ''; }
	else if (chgto == BIRTHDAY && occdate == '') { occdate = today; }
	else if (chgto == CHRISTMAS && occdate == '') { occdate = christmas; }
	else if (chgto == BIRTHDAY && from == CHRISTMAS) { occdate = today; }
	else if (chgto == CHRISTMAS && from == BIRTHDAY) { occdate = christmas; }

	if (occdate != '')
	{
		// prompt for the start date
		var text = 'Enter the date to begin calculating the '+word+' discount from (mm/dd/yyyy)\n';
		text += 'The normal $1/day discount will not apply ';
		if (chgto == CHRISTMAS) { text += 'for the seven days following this date'; }
		else { text += 'on this date.'; }

		var seldate = prompt(text,occdate);
		while (seldate != null && (seldate == '' || !validDate(seldate)))
		{
			if (validDate(seldate+'/'+thisYear)) { seldate = seldate+'/'+thisYear; }
			else
			{
				show = (seldate==''?'You did not enter a date.':seldate+' is not a valid date.');
				alert(show+'\nPlease enter a date in the format: mm/dd/yyyy');
				seldate = prompt(text,occdate);
			}
		}

		if (seldate == null) { do_change = false; }
		else
		{
			var d = new Date(seldate);
			seldate = date_format('m/d/Y',(d.getTime()/1000)); // make sure it's in mm/dd/yyyy format
		}
	}

	if (do_change)
	{
		if (seldate == '' || typeof(seldate) == 'undefined') { seldate = '{BLANK}'; }

		return_occasion[idx] = chgto;
		return_occasion_date[idx] = seldate;
		var base_price = return_purchprices[idx];
		var new_price = apply_price_mods(type,x,idx,itemID,base_price);

		post_data(type,idx,'ini_price_manual|ini_return_occasion|ini_return_occasion_date|ini_price','0|'+chgto+'|'+seldate+'|'+new_price);
		change_image(linkID,image);
		change_price(type,idx,new_price);
	}

	hide_layer();
	clearSearch(type);
}

//set the serial number for an item
function set_serial_number(type, x, idx, image, linkID, chgto, itemID)
{
	var from = '';
	
	if (type == SALE)
	{
		from = sale_serial_numbers[idx];
	}
	else if (type == TRADE)
	{
		from = trade_serial_numbers[idx];
	}
	else if (type == RETURNS)
	{
		from = return_serial_numbers[idx];
	}
	
	var set_to = prompt('Enter the serial number of the item', from);
	
	if (set_to == null)
	{
		// they cancelled the prompt
		hide_layer();
		return;
	}
	
	// update the value in the database
	if (type == SALE)
	{
		sale_serial_numbers[idx] = set_to;
	}
	else if (type == TRADE)
	{
		trade_serial_numbers[idx] = set_to;
	}
	else if (type == RETURNS)
	{
		return_serial_numbers[idx] = set_to;
	}
	
	post_data(
		type,
		idx,
		'ini_serial_number',
		set_to
	);
	
	hide_layer();
	clearSearch(type);
} // end function set_serial_number

// set the invoice item's quantity
function set_quantity(obj,type,x,idx,itemID)
{
	var qty = obj.value;

	if (qty == '')
	{
		if (type == SALE)
		{
			qty = sale_invoice_qtys[idx];
		}
		else if (type == TRADE)
		{
			qty = trade_invoice_qtys[idx];
		}
		else if (type == RETURNS)
		{
			qty = return_invoice_qtys[idx];
		}
	}

	var change = true;

	if (type == SALE)
	{
		if (sale_invoice_qtys[idx] == qty) { change = false; }
		else
		{
			var itmidx = array_search(itemID,qty_itemIDs);
			var nu = sale_newused[idx];
			if (nu == ITEM_NEW) { var checkqty = qty_new[itmidx]; } else { var checkqty = qty_used[itmidx]; }
			checkqty += sale_invoice_qtys[idx]; // add the item's current quantity to the available total

			if (qty > checkqty)
			{
				var origqty = qty_new_orig[itmidx];
				var invqty = (origqty-qty_new[itmidx]);
				var avail = (origqty-invqty);

				alert('You have exceeded the available '+(sale_newused[idx]==ITEM_NEW?'new':'used')+' quantity for this item.\n\nTotal On Hand: '+origqty+'\nTotal On Invoice: '+invqty+'\nAvailable: '+avail);
				qty = sale_invoice_qtys[idx];
				change = false;
			}

			sale_invoice_qtys[idx] = qty;
			var base_price = (sale_newused[idx]==ITEM_NEW?sale_new_prices[idx]:sale_used_prices[idx]);
		}
	}
	else if (type == TRADE)
	{
		if (trade_invoice_qtys[idx] == qty) { change = false; }
		else
		{
			trade_invoice_qtys[idx] = qty;
			var base_price = trade_used_prices[idx];
		}
	}
	else if (type == RETURNS)
	{
		if (return_invoice_qtys[idx] == qty) { change = false; }
		else
		{
			return_invoice_qtys[idx] = qty;
			var base_price = return_used_prices[idx];
		}
	}

	obj.value = qty;

	if (change)
	{
		var new_price = apply_price_mods(type,x,idx,itemID,base_price);
		post_data(type,idx,'ini_qty|ini_price',qty + '|' + new_price);
		change_price(type,idx,new_price);
	}
}

// update the original quantity that is shown
function update_orig_qty(type,idx,itmidx)
{
	$('origqty'+type+idx).innerText = qty_new_orig[itmidx]+'/'+qty_used_orig[itmidx];
}

// prompt for the percentage discount
function get_percent(def)
{
	return prompt('Enter a percentage to be taken off the sale price:\n(Enter 0 to remove the percentage)',def);
}

// set percentage discount
function set_percent(type,x,idx,itemID,dopost,setpercent)
{
	if (checklocked() == false)
	{
		if (setpercent == 123456)
		{
			var percent = get_percent(sale_percent[idx]);
		}
		else
		{
			var percent = setpercent;
		}

		if (percent != null)
		{
			sale_percent[idx] = percent;
			var lyrobj = $('percent' + SALE + '0' + idx);

			var settext = '';
			if (percent == 0)
			{
				settext = '<label for="perc'+idx+'"><img src="/images/invoice/setpercent.gif" width="35" height="11" border="0"></label>';
			}
			else
			{
				if (percent < 0)
				{
					var pre = '+';
					percent *= -1;
				}
				else
				{
					var pre = '-';
				}
				settext = pre+percent+'%';
			}

			lyrobj.innerHTML = settext;

			var base_price = (sale_newused[idx]==ITEM_NEW ? sale_new_prices[idx] : sale_used_prices[idx]);
			var new_price = apply_price_mods(type,x,idx,itemID,base_price);

			if (dopost == true) { post_data(type,idx,'ini_percentoff|ini_price',percent+'|'+new_price); }
			change_price(type,idx,new_price);
		}
	}
}

// set all percentages
function setAllPercent()
{
	if (checklocked() == false && sale_itemIDs.length)
	{
		var percent = get_percent(0);
		if (percent != null)
		{
			var data = '';

			var idxs = getIDXs(SALE);
			var timeaddeds = new Array();
			for (var i=0; i<sale_prices.length; i++)
			{
				if (in_array(i,eval('type' + SALE + '_idxs')))
				{
					// idx=i; linkID=(i*2)+1
					set_percent(SALE,array_search(i,idxs),i,sale_itemIDs[i],false,percent);
					data = data + percent + '|' + sale_prices[i] + ((i+1)<sale_prices.length ? '||' : '');
					timeaddeds[i] = eval('timeadded' + SALE)[i];
				}
			}

			post_data(SALE,-1,'ini_percentoff|ini_price',data,timeaddeds.join('|'));
		}
	}
}

// set all to cash or credit
function setAllCCN(cc)
{
	if (checklocked() == false && trade_itemIDs.length)
	{
		var idxs = eval('type' + TRADE + '_idxs');
		var base_links = (getIDXLength(SALE) * 2);
		var data = '';
		var timeaddeds = new Array();
		for (var i=0; i<idxs.length; i++)
		{
			// idx=idxs[i]; linkID=base_links+(i*3)+1
			idx = idxs[i];
			linkID = (base_links + (i * 3) + 1);
			change_ccn(
				TRADE,
				i,
				idx,
				(cc==CASH ? 'ccn-cash.gif' : 'ccn-credit.gif'),
				linkID,
				cc,
				trade_itemIDs[idx],
				false,
				true
			);
			data = data+'0|'+cc+'|'+trade_prices[idx]+((i+1)<idxs.length?'||':'');
			timeaddeds[i] = eval('timeadded' + TRADE)[i];
		}

		post_data(TRADE,-1,'ini_price_manual|ini_trade_type|ini_price',data,timeaddeds.join('|'));
		updateShownPrices(TRADE);
	}
}

// manually set a price
function manual_price(x,idx)
{
	if (trade_types[idx] == CREDIT)
	{
		orig = trade_prices[idx];
		var new_price = prompt('Enter a new credit amount:\nEnter nothing (an empty string, not 0!) to remove the manual price',orig);

		if (new_price != null && format_price(new_price) != format_price(orig))
		{
			if (new_price == '')
			{
				var manual = 0;
				var base_price = trade_used_prices[idx];
				var new_price = apply_price_mods(TRADE,x,idx,trade_itemIDs[idx],base_price);
			}
			else
			{
				var manual = 1;
			}

			trade_manual_price[idx] = manual;

			post_data(TRADE,idx,'ini_price_manual|ini_price',manual+'|'+new_price);
			change_price(TRADE,idx,new_price);
		}
	}
}

// change the price for an item
function change_price(type,idx,to_price,noupdate)
{
	if (type == TRADE) { trade_prices[idx] = to_price; }
	else if (type == SALE) { sale_prices[idx] = to_price; }
	else if (type == RETURNS) { return_prices[idx] = to_price; }

	if (!noupdate) { updateShownPrices(type); }
}

// updates the displayed prices
function updateShownPrices(type)
{
	var all_total_cash = 0;
	var all_total_credit = 0;
	var total_cash = 0;
	var total_credit = 0;
	var total_sale = 0;
	var total_return = 0;

	if (!type || type == SALE)
	{
		// sales
		rebuildIDXs(SALE);

		var len = getIDXLength(SALE);
		for (var j=0; j<len; j++)
		{
			var idx = eval('type' + SALE + '_idxs')[j];
			var lyrobj = $('prc' + SALE + '0' + idx);
			sale_prices[idx] = format_price(sale_prices[idx]);
			lyrobj.innerHTML = '$' + sale_prices[idx];
			total_sale += (sale_prices[idx]*1);
		}
		if (getIDXLength(SALE))
		{
			var totsalyr = $('prctot' + SALE + '0');
			eval('prctot' + SALE + '0').innerHTML = '$' + format_price(total_sale);
		}
	}

	if (!type || type == TRADE)
	{
		// trades
		rebuildIDXs(TRADE);

		var len = getIDXLength(TRADE);
		for (var j=0; j<len; j++)
		{
			var idx = eval('type' + TRADE + '_idxs')[j];
			var cavlyrobj = $('prcval' + TRADE + CASH + idx);
			var crvlyrobj = $('prcval' + TRADE + CREDIT + idx);
			cavlyrobj.innerHTML = '&nbsp;';
			crvlyrobj.innerHTML = '&nbsp;';

			// check if the price is a manual price; if so, set it to a temp var (apply_price_mods sets trade_manual_price[idx]=0 below)
			var set_price = null;
			if (trade_manual_price[idx]) { set_price = trade_prices[idx]; }

			// update the base cash/credit prices
			var origtype = trade_types[idx];
			var temptype = trade_types[idx];
			var base_price = trade_used_prices[idx];

			trade_types[idx] = CASH;
			var ca_price = apply_price_mods(TRADE,j,idx,trade_itemIDs[idx],base_price,false);
			trade_cash_prices[idx] = ca_price;

			trade_types[idx] = CREDIT;
			var cr_price = apply_price_mods(TRADE,j,idx,trade_itemIDs[idx],base_price,(trade_types[idx]==origtype));
			trade_credit_prices[idx] = cr_price;

			trade_types[idx] = origtype;

			cavlyrobj.innerHTML = '$' + ca_price;
			crvlyrobj.innerHTML = '$' + cr_price;
			all_total_cash += (ca_price*1);
			all_total_credit += (cr_price*1);

			// update the selected price
			var calyrobj = $('prc' + TRADE + CASH + idx);
			var crlyrobj = $('prc' + TRADE + CREDIT + idx);
			calyrobj.innerHTML = '&nbsp;';
			crlyrobj.innerHTML = '&nbsp;';

			if (set_price != null)
			{
				trade_manual_price[idx] = 1;
				trade_prices[idx] = format_price(trade_prices[idx]);
			}
			else
			{
				trade_prices[idx] = format_price((trade_types[idx]==CASH?trade_cash_prices[idx]:trade_credit_prices[idx]));
			}

			if (trade_types[idx] == CASH) { calyrobj.innerHTML = '$' + trade_prices[idx]; total_cash += (trade_prices[idx]*1); }
			else if (trade_types[idx] == CREDIT) { crlyrobj.innerHTML = '$' + trade_prices[idx]; total_credit += (trade_prices[idx]*1); }
		}
		if (getIDXLength(TRADE))
		{
			// update the cash/credit total prices
			var acalyrobj = $('alltotalprc' + CASH);
			var acrlyrobj = $('alltotalprc' + CREDIT);
			acalyrobj.innerHTML = '$' + format_price(all_total_cash);
			acrlyrobj.innerHTML = '$' + format_price(all_total_credit);

			var totcalyr = $('prctot' + TRADE + CASH);
			var totcrlyr = $('prctot' + TRADE + CREDIT);
			eval('prctot' + TRADE + CASH).innerHTML = '$' + format_price(total_cash);
			eval('prctot' + TRADE + CREDIT).innerHTML = '$' + format_price(total_credit);
		}
	}

	if (!type || type == RETURNS)
	{
		// returns
		rebuildIDXs(RETURNS);

		var len = getIDXLength(RETURNS);
		for (var j=0; j<len; j++)
		{
			var idx = eval('type' + RETURNS + '_idxs')[j];
			var lyrobj = $('prc' + RETURNS + '0' + idx);
			return_prices[idx] = format_price(apply_price_mods(RETURNS,j,idx,trade_itemIDs[idx],return_purchprices[idx]));
			lyrobj.innerHTML = '$' + return_prices[idx];
			total_return += (return_prices[idx]*1);

			if (return_types[idx] == CASH) { total_cash += (return_prices[idx]*1); }
			else if (return_types[idx] == CREDIT) { total_credit += (return_prices[idx]*1); }
		}
		if (getIDXLength(RETURNS))
		{
			var totretlyr = $('prctot' + RETURNS + '0');
			eval('prctot' + RETURNS + '0').innerHTML = '$' + format_price(total_return);
		}
	}

	if (!type || type == TRADE || type == RETURNS)
	{
		tbl_catot.innerHTML = '$' + format_price(total_cash);
		tbl_crtot.innerHTML = '$' + format_price(total_credit);
	}
	else if (!type || type == SALE)
	{
		tbl_satot.innerHTML = '$' + format_price(total_sale);
	}

	if (getIDXLength(SALE))
	{
		blnk.style.display = 'none';
		topmnt.style.display = 'block';
		tocmplt.style.display = 'none';
	}
	else
	{
		blnk.style.display = 'none';
		topmnt.style.display = (getIDXLength(TRADE) ? 'none' : 'block');
		tocmplt.style.display = (getIDXLength(TRADE) ? 'block' : 'none');
	}
}

// returns the new/used quantity on hand for a given itemID (the itemID must be on the invoice; if not, a 0 is returned)
function get_quantity(itemID,nu)
{
	var idx = array_search(itemID,qty_itemIDs);
	if (idx > -1)
	{
		var qnew = qty_new_orig[idx];
		var qused = qty_used_orig[idx];

		if (nu == ITEM_NEW) { return qnew; }
		else { return qused; }
	}
	else { return -1; }
}

// change the information in the session variable and database
function post_data(type,idx,field,to,timeaddeds)
{
	var timearr = eval('timeadded' + type);

	var frm = document.itmfrm;
	frm.type.value = type;
	frm.idx.value = idx;
	frm.timeadded.value = (idx==-1 ? timeaddeds : timearr[idx]);
	frm.field.value = field;
	frm.to.value = to;
	frm.submit();

	set_status('Updating database...',true);
}

// change the employeeID
function set_employeeID(employeeID)
{
	var frm = document.itmfrm;
	frm.employeeID.value = employeeID;
	frm.submit();

	set_status('Updating database...',true);
}

// change the close after complete
function set_closecomplete(c)
{
	var frm = document.itmfrm;
	frm.closecustomer.value = c;
	frm.submit();

	set_status('Updating database...',true);
}

// change the status text/variable
var lock = false;
function set_status(txt,dolock)
{
	lock = dolock;

	if (lock) { show_locked(); }
	else { hide_locked(); }

	invstatus.innerText = txt;
}

// returns whether the functionality is locked or not
function checklocked()
{
	if (lock) { show_locked(); }
	return lock;
}

// display/hide the 'invoice locked' layer
function show_locked()
{
	clearTimeout(lock_timer);

	var obj = lockedlyr;
	obj.style.visibility = 'visible';

	var t = posY;
	var l = (posX-(parseFloat(obj.style.width)/2));

	t -= 15;
	if (t < 1) { t = 1; } // too far up
	if (l < 1) { l = 1; } // too far left
	if (t > (height-40)) { t = (height-40); } // too far down
	if ((l+parseFloat(obj.style.width)) > width) { l = (width-parseFloat(obj.style.width)); } // too far right

	obj.style.top = t;
	obj.style.left = l;

	lock_timer = setTimeout('hide_locked()',5000);
}
function hide_locked()
{
	lockedlyr.style.visibility = 'hidden';
}

// display/hide the pricing details layer
var inpricing = false;
function show_pricing_details(idx)
{
	clearTimeout(prc_timer);

	var lyrwidth = 225;

	var obj = pricinglyr;
	obj.style.visibility = 'visible';
	obj.style.width = lyrwidth;
	obj.innerHTML = pricing_lines[idx];

	var t = posY-15;
	var l = (posX-(parseFloat(obj.style.width)/2));

	if (t < 1) { t = 1; } // too far up
	if (l < 1) { l = 1; } // too far left
	if ((l+lyrwidth) > (screen.availWidth-50)) { l = (screen.availWidth-lyrwidth-50); } // too far right

	if (t > (height-40)) { t = (height-40); } // too far down
	if ((l+parseFloat(obj.style.width)) > width) { l = (width-parseFloat(obj.style.width)); } // too far right

	obj.style.top = t;
	obj.style.left = l;

	inpricing = true;
	prc_timer = setTimeout('hide_pricing_details()',1000);
}
function hide_pricing_details()
{
	if (!inpricing) { pricinglyr.style.visibility = 'hidden'; }
	else { prc_timer = setTimeout('hide_pricing_details()',1000); }
}
function format_pricing_lines(lines,idx)
{
	var halfused = false;
	var halftwice = false;
	var end = '';
	var ret = '<table border="0" width="200" cellspacing="3" cellpadding="0">';
	ret += '<tr><td width="50"><b>Mod</b></td><td width="150"><b>Action</b></td><td width="25"><b>RunTot</b></td></tr>';
	ret += '<tr><td colspan="3" height="1" bgcolor="#000000"><img src="/images/blank.gif" width="1" height="1" /></td></tr>';

	for (var i=0; i<lines.length; i++)
	{
		var vals = lines[i].split('|');

		var b = ''; var a = '';
		if (vals[0] == 'Final')
		{
			ret += '<tr><td colspan="3" height="1" bgcolor="#000000"><img src="/images/blank.gif" width="1" height="1" /></td></tr>';
			b = '<b>'; a = '</b>';
		}

		if (vals.length == 4 && vals[3] > 0)
		{
			halfused = true;
			if (vals[3] == 2) { halftwice = true; }
			b = '<font color="red">'+b; a += '</font>';
		}

		if (vals.length == 1) { end += '<tr><td colspan="3" align="center">'+vals[0]+'</td></tr>'; }
		else { ret += '<tr><td>'+b+vals[0]+a+'</td><td>'+b+vals[1]+a+'</td><td>'+b+format_price(vals[2])+a+'</td></tr>'; }
	}

	if (halfused)
	{
		var ht = '';
		if (halftwice) { ht = '<br />Due to condition, 1/2 value was applied twice'; }
		ret += '<tr><td colspan="3">&nbsp;<br /><font color="red">* 1/2 value was used for this discount'+ht+'</font></td></tr>';
	}

	ret += (end.length?'<tr><td colspan="3"><img src="/images/dot.gif" width="1" height="5" /></td></tr>':'')+end;
	ret += '</table>';

	return ret;
}

function check_select_lock(obj)
{
	posY += 15;
	if (checklocked() == true)
	{
		obj.style.display = 'block';
		obj.focus();
		obj.style.display = 'none';
	}
}

// check if an employee is selected - if so, return true
// if not, ask if they want to continue without selecting an employee
function check_employee()
{
	var obj = document.emplID.employeeID;

	if (obj.options.length == 1) { return true; }
	else
	{
		if (obj.selectedIndex == 0) { return confirm("You didn't select an employee.\n\nAre you sure you want to continue?"); }
		else { return true; }
	}
}

// check if they have any items selected to remove - if not, return true
// if so, ask if they want to continue without removing the items
function check_remove()
{
	if (!remove_trade.length && !remove_sale.length) { return true; }
	else { return confirm('You have selected items to remove. Are you sure you want to continue without removing them?'); }
}

function srchverify(frm)
{
	if (frm.elements['criteria[upctitle]'].value == '' && frm.elements['criteria[platformID]'].selectedIndex == 0) { frm.elements['criteria[upctitle]'].focus(); return false; }
	else { lock_search(true); return true; }
}

// search returned no results - alert and clear form
function no_results(type)
{
	alert('Your search returned no results');
	lock_search(false);

	var selelem = -1;
	var isselect = false;
	var first_text = -1;
	var obj = $('lookup'+type);
	for (var i=0; i<obj.elements.length; i++)
	{
		if (obj.elements[i].type == 'text' && first_text == -1) { first_text = i; }

		if (obj.elements[i].type == 'text' && obj.elements[i].value != '') { selelem = i; break; }
		else if (obj.elements[i].type == 'select-one' && obj.elements[i].selectedIndex != 0) { selelem = i; isselect = true; break; }
	}

	if (selelem == -1) { obj.elements[first_text].focus(); }
	else if (!isselect) { obj.elements[selelem].select(); }
	else { obj.elements[selelem].focus(); }
}

// view the search results
function view_results(type)
{
	lock_search(true);
	open_window('/admin/pos/invoice_lookup_results.php?type='+type,'invlookup',725,500,'YES',true);
}

// show add error and clear form
function add_error(error,type)
{
	alert(error);
	clearSearch(type);
}

// ask if they would like to update their quantity for the given item (force an item into the inventory)
function ask_force(idx,title,type,itemID)
{
	if (confirm('Would you like to update your inventory quantities for '+title+'?\nThis allows you to "force" an item into your inventory'))
	{
		if (itemID != -1) { resultIDX = -1; invoiceIDX = idx; }
		else { resultIDX = idx; invoiceIDX = -1; }

		open_window('/admin/pos/invoice_force.php?resultIDX='+resultIDX+'&invoiceIDX='+invoiceIDX+'&type='+type+'&itemID='+itemID,'invforce',725,500,'YES');
	}
}

// clear the search form and set focus to the UPC box
function clearSearch(type)
{
	lock_search(false);

	var selelem = -1;
	var obj = $('lookup'+type);
	for (var i=0; i<obj.elements.length; i++)
	{
		if (obj.elements[i].type == 'text')
		{
			obj.elements[i].value = '';
			if (selelem == -1) { selelem = i; }
		}
		else if (obj.elements[i].type == 'select-one')
		{
			obj.elements[i].selectedIndex = 0;
			if (selelem == -1) { selelem = i; }
		}
	}

	obj.elements[selelem].focus();
}

// lock/unlock the search forms
function lock_search(lock)
{
	if (lock) { var a = 'none'; var b = 'inline'; }
	else { var a = 'inline'; var b = 'none'; }

	$('search' + TRADE).style.display = a;
	$('searching' + TRADE).style.display = b;
	$('search' + SALE).style.display = a;
	$('searching' + SALE).style.display = b;
	$('search' + RETURNS).style.display = a;
	$('searching' + RETURNS).style.display = b;
}

// add/remove items from the list of items to remove
var remove_trade = new Array();
var remove_sale = new Array();
var remove_return = new Array();
function add_remove(type,x,idx,chk)
{
	if (type == TRADE) { var arr = remove_trade; }
	else if (type == SALE) { var arr = remove_sale; }
	else if (type == RETURNS) { var arr = remove_return; }

	if (chk) { arr[arr.length] = idx; } // add the item to the array
	else
	{
		// remove the item from the array
		var newarr = new Array();
		for (var i=0; i<arr.length; i++)
		{
			if (arr[i] != idx) { newarr[newarr.length] = arr[i]; }
		}
		arr = newarr;
	}

	if (type == TRADE) { remove_trade = arr; }
	else if (type == SALE) { remove_sale = arr; }
	else if (type == RETURNS) { remove_return = arr; }

	if (remove_trade.length || remove_sale.length || remove_return.length) { $('rembutton').disabled = false; }
	else { $('rembutton').disabled = true; }

	$('rem'+type+idx).checked = chk;
}
function clearRemove()
{
	remove_trade = new Array();
	remove_sale = new Array();
	remove_return = new Array();

	$('rembutton').disabled = true;
}

// removes the selected items from the invoice (submits the entire page)
function removeItems()
{
	if (checklocked() == false)
	{
		if ((remove_trade.length || remove_sale.length || remove_return.length) && confirm('Are you SURE you want to remove these items from the invoice?'))
		{
			var frm = document.remfrm;
			frm.remove_sale.value = remove_sale;
			frm.remove_trade.value = remove_trade;
			frm.remove_return.value = remove_return;
			frm.submit();
		}
	}
}

// perform the last search for the given type
function lastSearch(type,frm)
{
	lock_search(true);
	frm.dolast.value = YES;
	frm.submit();
	frm.dolast.value = NO;
}

// set the tooltip for the last search button of the given type
function setLastTooltip(type,txt)
{
	var obj = $('redolast'+type);
	if (obj)
	{
		// maintain whatever text precedes the ':'
		var cpos = obj.alt.indexOf(':');
		obj.alt = obj.alt.substring(0,cpos)+': '+txt;
	}
}

/**
* Handle the outcome of a quick item add with items selected to come to the invoice
*/
function doQuickAdd(qatype)
{
	lock_search(true);
	$('from_quickadd' + qatype).value = YES;
	$('lookup' + qatype).submit();

}

/* END OF FILE */