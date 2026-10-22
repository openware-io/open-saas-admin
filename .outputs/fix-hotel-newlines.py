from pathlib import Path

p = Path("src/views/tenant/hotel.vue")
text = p.read_text(encoding="utf-8")
text = text.replace("`n", "\n")
text = text.replace("默认 USD；切换币种不做汇率换算。", "默认币种由租户/门店设置；切换币种不做汇率换算。")
p.write_text(text, encoding="utf-8")
print("fixed")
