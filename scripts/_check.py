# 独立按 Excel 公式逻辑重算，校验数值合理（不依赖 Excel 引擎）
def calc(sid, n, base):
    if sid=="damage": return base*1.2**n
    if sid=="fireRate": return 1000/(base*0.85**n*(0.95 if n>=3 else 1)*(0.95 if n>=5 else 1))
    if sid=="bulletCount": return base+n
    if sid=="bulletSpeed": return base*1.2**n*(1.1 if n>=3 else 1)
    if sid=="piercing": return base+n+(1 if n>=3 else 0)
    if sid=="health": return base+20*n+(10*(n-2) if n>=3 else 0)
    if sid=="explosive": return (40+20*n)*(1.5 if n>=5 else 1)
    if sid=="lightning": return n+1+(2 if n>=3 else 0)
    if sid=="shield": return n*0.1+(0.05 if n>=3 else 0)
    if sid=="crit": return min(0.6,n*0.05)
    if sid=="freeze": return min(0.5,n*0.06)
    if sid=="slow": return min(0.6,n*0.08)
    if sid=="mine": return 2+n
    if sid=="oil": return 1+n+(1 if n>=5 else 0)
    if sid=="tornado": return 140+20*n

bases={"damage":10,"fireRate":500,"bulletCount":1,"bulletSpeed":10,"piercing":1,"health":100,
       "explosive":10,"lightning":10,"shield":0,"crit":0,"freeze":0,"slow":0,
       "mine":10,"oil":10,"tornado":10}
samples={"damage":[1,3,5,10],"fireRate":[1,3,5,10],"bulletCount":[1,5,20],"bulletSpeed":[1,3,5],
         "piercing":[1,3,5],"health":[1,3,10],"explosive":[1,3,5],"lightning":[1,3,5],
         "shield":[1,3,5,8],"crit":[1,3,5,12],"freeze":[1,3,8],"slow":[1,3,8],
         "mine":[1,3,5,10],"oil":[1,3,5],"tornado":[1,3,5,10]}
ok=True
for sid,lv in samples.items():
    vals=[round(calc(sid,n,bases[sid]),3) for n in lv]
    bad=[v for v in vals if v is None or (isinstance(v,(int,float)) and (v!=v or v<0))]
    print(f"{sid:11s} Lv{lv} = {vals}")
    if bad: ok=False; print("  !! BAD",bad)
print("ALL_OK" if ok else "HAS_BAD")
