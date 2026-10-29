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
