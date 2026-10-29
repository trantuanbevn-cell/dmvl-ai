import ezdxf, math
from ezdxf.enums import TextEntityAlignment
def plan(doc, msp, walls='line'):
    # 3 phòng 4x5 m (đơn vị mm), tường dày 200
    xs=[0,4000,8000,12000]
    if walls=='line':
        for y in (0,5000):
            msp.add_line((0,y),(12000,y),dxfattribs={'layer':'A-WALL'}); msp.add_line((0,y+200 if y==0 else y-200),(12000,y+200 if y==0 else y-200),dxfattribs={'layer':'A-WALL'})
        for x in xs: msp.add_line((x,0),(x,5000),dxfattribs={'layer':'A-WALL'})
    else:
        doc.mline_styles  # ensure
        msp.add_mline([(0,0),(12000,0),(12000,5000),(0,5000)], close=True, dxfattribs={'layer':'A-WALL','scale_factor':200})
        for x in xs[1:3]: msp.add_mline([(x,0),(x,5000)], dxfattribs={'layer':'A-WALL','scale_factor':200})
    # nhiều nét phụ để vượt ngưỡng 20 nét
    for i in range(30): msp.add_line((i*400,-1500),(i*400+200,-1500),dxfattribs={'layer':'A-DIM'})
    return xs

def build(ver, name, walls='line'):
    doc = ezdxf.new(ver, setup=True); doc.header['$INSUNITS']=4
    msp = doc.modelspace(); xs=plan(doc,msp,walls)
    # 1) TEXT căn giữa: điểm 10 (góc trái) khác điểm 11 (tâm) như AutoCAD lưu
    t=msp.add_text('PHÒNG KHÁCH', dxfattribs={'height':250,'layer':'A-TEXT'}); t.set_placement((2000,2500), align=TextEntityAlignment.MIDDLE_CENTER); t.dxf.insert=(1000,2375)
    # 2) Block nhãn phòng có ATTRIB
    b=doc.blocks.new('ROOMTAG'); b.add_attdef('TEN',(0,0),dxfattribs={'height':250}); b.add_attdef('DT',(0,-400),dxfattribs={'height':200})
    ins=msp.add_blockref('ROOMTAG',(6000,2500),dxfattribs={'layer':'A-TAG'}); ins.add_auto_attribs({'TEN':'PHÒNG NGỦ','DT':'S=19,6m2'})
    # 3) MULTILEADER ghi chú tên phòng
    try:
        ml=msp.add_multileader_mtext('Standard'); ml.set_content('BẾP',char_height=250); ml.add_leader_line(ezdxf.render.ConnectionSide.left,[(10000,3500)]); ml.build(insert=ezdxf.math.Vec2(10500,2500))
    except Exception as e: print('mleader',e)
    # 4) ARC có pháp tuyến -Z (khối bị lật/mirror trong AutoCAD) – tâm thật (11000,1000)
    a=msp.add_arc((-11000,1000),800,0,90,dxfattribs={'layer':'A-DOOR','extrusion':(0,0,-1)})
    # 5) SPLINE qua các điểm điều khiển
    msp.add_spline_control_frame([(500,4000),(1500,4800),(2500,3200),(3500,4000)],dxfattribs={'layer':'A-FURN'})
    # 6) Khối đồ bị lật (scale x = -1)
    s=doc.blocks.new('SOFA'); s.add_lwpolyline([(0,0),(2000,0),(2000,900),(0,900)],close=True)
    msp.add_blockref('SOFA',(7000,500),dxfattribs={'layer':'A-FURN','xscale':-1})
    # 7) DIMENSION đo thật 4000
    d=msp.add_linear_dim(base=(0,-800),p1=(0,0),p2=(4000,0),dxfattribs={'layer':'A-DIM'}); d.render()
    doc.saveas(name)
build('R2018','t2018.dxf'); build('R2000','t2000.dxf'); build('R2018','tmline.dxf','mline')
d=ezdxf.readfile('t2018.dxf'); d.saveas('tbin.dxf', fmt='bin')
print('ok')

# ---- Bản vẽ "không layer, không block": mọi nét ở layer 0, chỉ khác bút in (màu 4 = nét đậm 0.3 mm theo CTB công ty) ----
def nolayer(name):
    doc = ezdxf.new('R2018'); doc.header['$INSUNITS'] = 4; msp = doc.modelspace()
    H = {'layer': '0', 'color': 4}; T = {'layer': '0', 'color': 8}
    def wall(x0, y0, x1, y1, t=200):  # tường = 2 nét đậm song song + bịt đầu
        import math
        dx, dy = x1 - x0, y1 - y0; L = math.hypot(dx, dy); nx, ny = -dy / L * t / 2, dx / L * t / 2
        msp.add_lwpolyline([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)], close=True, dxfattribs=H)
    # phòng 6 x 5 m, cửa đi 900 ở tường dưới (x 2000–2900)
    wall(0, 0, 2000, 0); wall(2900, 0, 6000, 0); wall(6000, 0, 6000, 5000); wall(6000, 5000, 0, 5000); wall(0, 5000, 0, 0)
    msp.add_line((2000, 100), (2000, 1000), dxfattribs=T)                      # cánh cửa (mở vào trong)
    msp.add_arc((2000, 100), 900, 0, 90, dxfattribs=T)                         # cung quay
    # đồ đạc nét mảnh: bàn 1800x900, sofa sát tường
    msp.add_lwpolyline([(3000, 2000), (4800, 2000), (4800, 2900), (3000, 2900)], close=True, dxfattribs=T)
    msp.add_lwpolyline([(4000, 4400), (5800, 4400), (5800, 4900), (4000, 4900)], close=True, dxfattribs=T)
    # thang bộ 10 bậc (280) chạy theo +x từ x=600; vòng tròn ở chân thang; đường cắt xiên
    for i in range(11): msp.add_line((600 + i * 280, 3000), (600 + i * 280, 4200), dxfattribs=T)
    msp.add_line((600, 3000), (3400, 3000), dxfattribs=T); msp.add_line((600, 4200), (3400, 4200), dxfattribs=T)
    msp.add_circle((750, 3600), 80, dxfattribs=T)
    msp.add_line((2300, 3000), (2900, 4200), dxfattribs=T)
    for i in range(30): msp.add_line((i * 200, -2000), (i * 200 + 100, -2000), dxfattribs=T)
    doc.saveas(name)
nolayer('tnolayer.dxf')
