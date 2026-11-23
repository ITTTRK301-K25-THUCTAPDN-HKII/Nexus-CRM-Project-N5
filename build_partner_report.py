from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


OUT = "Bao_cao_du_an_Nexus_CRM.docx"
NAVY = "142B4A"
BLUE = "1E5B83"
TEAL = "178C88"
PALE = "EAF3F5"
LIGHT = "F3F6F9"
MID = "D7E1E8"
INK = "233447"
MUTED = "607386"
WHITE = "FFFFFF"


def shade(cell, color):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), color)
    tc_pr.append(shd)


def cell_margins(cell, top=90, start=110, bottom=90, end=110):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    mar = tc_pr.first_child_found_in("w:tcMar")
    if mar is None:
        mar = OxmlElement("w:tcMar")
        tc_pr.append(mar)
    for side, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = mar.find(qn("w:" + side))
        if node is None:
            node = OxmlElement("w:" + side)
            mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_keep(paragraph, keep_next=False, keep_lines=True):
    ppr = paragraph._p.get_or_add_pPr()
    if keep_lines:
        el = OxmlElement("w:keepLines")
        ppr.append(el)
    if keep_next:
        el = OxmlElement("w:keepNext")
        ppr.append(el)


def set_font(run, size=None, bold=None, color=INK, name="Arial", italic=None):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), name)
    run.font.color.rgb = RGBColor.from_string(color)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic


def add_field(paragraph, field):
    r = OxmlElement("w:r")
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = field
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    value = OxmlElement("w:t")
    value.text = "1"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    r.append(begin)
    r.append(instr)
    r.append(separate)
    r.append(value)
    r.append(end)
    paragraph._p.append(r)


doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Inches(8.27), Inches(11.69)
sec.top_margin, sec.bottom_margin = Inches(.78), Inches(.72)
sec.left_margin, sec.right_margin = Inches(.82), Inches(.82)
sec.header_distance, sec.footer_distance = Inches(.34), Inches(.35)

styles = doc.styles
normal = styles["Normal"]
normal.font.name = "Arial"
normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
normal.font.size = Pt(10)
normal.font.color.rgb = RGBColor.from_string(INK)
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.line_spacing = 1.12
for stylename, size, color in (("Title", 30, NAVY), ("Heading 1", 19, NAVY), ("Heading 2", 13, BLUE), ("Heading 3", 11, TEAL)):
    style = styles[stylename]
    style.font.name = "Arial"
    style._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    style.font.size = Pt(size)
    style.font.bold = True
    style.font.color.rgb = RGBColor.from_string(color)
    style.paragraph_format.space_before = Pt(15 if stylename == "Heading 1" else 10)
    style.paragraph_format.space_after = Pt(6)
    style.paragraph_format.keep_with_next = True

header = sec.header.paragraphs[0]
header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
set_font(header.add_run("NEXUS CRM  /  BÁO CÁO DỰ ÁN"), 8, True, MUTED)
footer = sec.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
set_font(footer.add_run("Tài liệu trao đổi với đối tác  ·  23/11/2026  ·  Trang "), 8, False, MUTED)
add_field(footer, "PAGE")


def para(text="", style=None, bold_lead=None):
    p = doc.add_paragraph(style=style)
    if bold_lead and text.startswith(bold_lead):
        set_font(p.add_run(bold_lead), 10, True)
        set_font(p.add_run(text[len(bold_lead):]), 10)
    else:
        set_font(p.add_run(text), 10)
    set_keep(p)
    return p


def bullet(text, level=0):
    p = doc.add_paragraph(style="List Bullet" if level == 0 else "List Bullet 2")
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.left_indent = Inches(.27 + .22 * level)
    p.paragraph_format.first_line_indent = Inches(-.15)
    set_font(p.add_run(text), 9.7)
    set_keep(p)
    return p


def numbered(text):
    p = doc.add_paragraph(style="List Number")
    p.paragraph_format.space_after = Pt(4)
    set_font(p.add_run(text), 9.7)
    set_keep(p)
    return p


def heading(text, level=1):
    p = doc.add_paragraph(style=f"Heading {level}")
    set_font(p.add_run(text), {1: 19, 2: 13, 3: 11}[level], True, {1: NAVY, 2: BLUE, 3: TEAL}[level])
    set_keep(p, keep_next=True)
    return p


def table(headers, rows, widths=None, font_size=8.4):
    t = doc.add_table(rows=1, cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    if widths:
        for col, width in zip(t.columns, widths):
            col.width = Inches(width)
    hdr = t.rows[0]
    set_repeat_table_header(hdr)
    for i, title in enumerate(headers):
        c = hdr.cells[i]
        c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        shade(c, NAVY)
        cell_margins(c, 100, 105, 100, 105)
        p = c.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        set_font(p.add_run(title), font_size, True, WHITE)
    for ridx, row in enumerate(rows):
        cells = t.add_row().cells
        for i, value in enumerate(row):
            c = cells[i]
            c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
            cell_margins(c)
            if ridx % 2 == 1:
                shade(c, LIGHT)
            p = c.paragraphs[0]
            p.paragraph_format.space_after = Pt(1)
            p.paragraph_format.line_spacing = 1.04
            set_font(p.add_run(str(value)), font_size, False, INK)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return t


def pagebreak():
    doc.add_page_break()


# Cover
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(95)
p.paragraph_format.space_after = Pt(12)
set_font(p.add_run("NEXUS CRM"), 12, True, TEAL)
p = doc.add_paragraph(style="Title")
p.paragraph_format.space_after = Pt(12)
set_font(p.add_run("Báo cáo tổng quan dự án"), 30, True, NAVY)
p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(25)
set_font(p.add_run("Phạm vi chức năng · Kiến trúc · Vận hành · Bàn giao đối tác"), 14, False, BLUE)
para("Tài liệu này trình bày hệ thống Nexus CRM theo các luồng nghiệp vụ bán hàng và chăm sóc khách hàng, các thành phần kỹ thuật, tích hợp, kiểm soát truy cập và cách triển khai được cấu hình trong dự án.")
doc.add_paragraph()
table(["THÔNG TIN", "CHI TIẾT"], [
    ("Đối tượng sử dụng", "Đối tác, đơn vị tiếp nhận và nhóm triển khai hệ thống"),
    ("Ngày lập", "23 tháng 11 năm 2026"),
    ("Phạm vi ghi nhận", "Mã nguồn, tài liệu dự án, lược đồ dữ liệu, cấu hình triển khai và cấu hình CI hiện có"),
    ("Mục tiêu", "Thống nhất hiểu biết về năng lực sản phẩm, các phụ thuộc khi triển khai và nội dung cần xác nhận trong bàn giao"),
], [1.55, 4.95], 9)
doc.add_paragraph()
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(14)
set_font(p.add_run("KẾT LUẬN ĐIỀU HÀNH"), 9, True, TEAL)
para("Nexus CRM là ứng dụng CRM web tích hợp quản lý Lead, khách hàng, cơ hội bán hàng, báo giá, công việc, lịch hẹn và báo cáo doanh số trên một nền tảng. Thiết kế bao gồm phân quyền theo vai trò, dữ liệu MySQL, triển khai Docker Compose và các tích hợp tùy chọn Gemini AI, Telegram. Để đưa hệ thống vào môi trường đối tác, cần chốt cấu hình hạ tầng, chính sách dữ liệu, người dùng/quyền truy cập, thông tin kết nối và quy trình nghiệm thu.")

pagebreak()
heading("Nội dung báo cáo", 1)
for item in [
    "01  Tóm tắt phạm vi và giá trị nghiệp vụ",
    "02  Luồng nghiệp vụ từ Lead đến chăm sóc khách hàng",
    "03  Chi tiết các phân hệ chức năng",
    "04  Vai trò người dùng và kiểm soát dữ liệu",
    "05  Kiến trúc ứng dụng và thành phần kỹ thuật",
    "06  Mô hình dữ liệu và tích hợp bên ngoài",
    "07  Bảo mật, chất lượng và khả năng quan sát",
    "08  Triển khai, cấu hình và vận hành",
    "09  Bằng chứng sẵn có và tiêu chí nghiệm thu",
    "10  Các điểm cần xác nhận với đối tác",
    "11  Đề xuất kế hoạch tiếp nhận và bàn giao",
    "Phụ lục A  Danh mục API theo nhóm nghiệp vụ",
    "Phụ lục B  Danh mục tài liệu kỹ thuật đã đối chiếu",
]:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(7)
    set_font(p.add_run(item), 11, False, INK)
para("Cách đọc: các nội dung mô tả khả năng hiện có được tổng hợp từ mã nguồn và tài liệu trong kho dự án. Trạng thái vận hành thực tế, cấu hình tài khoản tích hợp và dữ liệu của môi trường đích được chốt trong biên bản bàn giao.")

heading("01  Tóm tắt phạm vi và giá trị nghiệp vụ", 1)
para("Mục tiêu của Nexus CRM là quản lý xuyên suốt quan hệ bán hàng: tiếp nhận khách hàng tiềm năng, chuyển đổi thành hồ sơ doanh nghiệp và người liên hệ, theo dõi cơ hội theo từng giai đoạn, lập báo giá gắn với Deal, giao việc cho nhân viên, lên lịch tương tác và đo lường kết quả. Dữ liệu được kết nối qua các thực thể dùng chung thay vì lưu rời rạc theo từng màn hình.")
table(["NĂNG LỰC", "KẾT QUẢ HỖ TRỢ NGHIỆP VỤ"], [
    ("Một hồ sơ khách hàng thống nhất", "Theo dõi Account, Contact, Deal, Task, lịch hẹn và hoạt động trong cùng mối quan hệ."),
    ("Quản lý quy trình bán hàng", "Nhìn rõ giai đoạn, giá trị dự kiến, xác suất, ngày chốt dự kiến và kết quả WON/LOST."),
    ("Chuẩn hóa thương mại", "Lập báo giá theo danh mục sản phẩm, tính chiết khấu/VAT, ghi nhận phê duyệt và quản lý phiên bản."),
    ("Điều hành đội ngũ", "Giao Lead và Task; xem KPI, phễu và hiệu suất Sale theo kỳ và theo tiền tệ."),
    ("Hỗ trợ năng suất", "Gợi ý từ Gemini trên hồ sơ khách hàng và nhắc việc gần đến hạn qua Telegram khi được cấu hình."),
], [1.65, 4.85])
heading("Trạng thái mô tả", 2)
para("Báo cáo xác nhận phạm vi được thể hiện trong kho mã tại thời điểm lập báo cáo. Repository có các thành phần để chạy cục bộ và triển khai bằng Docker Compose. Mã nguồn và cấu hình không tự xác nhận rằng một môi trường đối tác đã được cài đặt, chạy dữ liệu thật, kết nối dịch vụ ngoài hoặc đạt tiêu chí nghiệm thu.")

heading("02  Luồng nghiệp vụ từ Lead đến chăm sóc khách hàng", 1)
for text in [
    "Tiếp nhận Lead: nhập thông tin cá nhân/công ty, nguồn, email, điện thoại, ghi chú và nhân viên phụ trách. Danh sách hỗ trợ tìm kiếm, lọc trạng thái và phân trang; có kiểm tra dữ liệu và phát hiện trùng thông tin liên hệ.",
    "Đánh giá và chuyển đổi: Sale cập nhật trạng thái Lead từ mới đến đã liên hệ, đủ điều kiện hoặc không phù hợp. Lead đủ điều kiện có thể chuyển thành Account và Contact để tiếp tục quản lý trong hồ sơ khách hàng.",
    "Quản lý khách hàng: Account đại diện doanh nghiệp, Contact đại diện người liên hệ. Hồ sơ tập trung thông tin doanh nghiệp, đầu mối, cơ hội Deal và nhật ký hoạt động; người dùng có thể ghi nhận cuộc gọi, email, cuộc họp hoặc ghi chú.",
    "Theo dõi cơ hội: tạo Deal gắn Account, tùy chọn Contact, Sale phụ trách, giá trị, đơn vị tiền tệ, xác suất và ngày dự kiến chốt. Deal di chuyển qua các giai đoạn; khi thắng hoặc thất bại, hệ thống yêu cầu thông tin kết quả tương ứng.",
    "Lập và xét duyệt báo giá: chọn Deal, sản phẩm cùng loại tiền tệ, số lượng, giá, chiết khấu và VAT. Hệ thống tính lại tổng ở máy chủ, hỗ trợ gửi yêu cầu duyệt, quyết định duyệt/từ chối và tạo phiên bản khi cần sửa báo giá.",
    "Điều phối thực thi: tạo Task có người nhận, mức ưu tiên, hạn hoàn thành và liên kết hồ sơ liên quan; tạo lịch hẹn một lần hoặc lặp hàng tuần/hàng tháng. Tương tác hoàn tất được lưu trong Activity để làm cơ sở chăm sóc tiếp theo.",
    "Đo lường và cải thiện: theo dõi KPI, phễu Lead/Deal và hiệu suất từng Sale. Copilot có thể tóm tắt hồ sơ 360 độ và đề xuất hành động; Sale quyết định có tạo Task từ đề xuất hay không.",
]:
    numbered(text)

heading("03  Chi tiết các phân hệ chức năng", 1)
heading("3.1 Lead và chuyển đổi khách hàng", 2)
para("Lead lưu thông tin đầu mối tiềm năng, công ty, email, điện thoại, nguồn, trạng thái và ghi chú. Danh sách có tìm kiếm theo thông tin chính, lọc trạng thái và phân trang. Các thao tác hỗ trợ tạo, sửa, giao Lead và xóa mềm; API có phát hiện trùng email/điện thoại theo quy tắc của dự án. Khi Lead đủ điều kiện, quy trình chuyển đổi tạo/liên kết Account và Contact, duy trì liên kết truy vết từ Lead đã chuyển đổi.")
heading("3.2 Account, Contact và Customer 360°", 2)
para("Account lưu tên doanh nghiệp, ngành, website, thông tin liên hệ và địa chỉ thanh toán; Contact gắn với Account, gồm họ tên, chức danh, email và điện thoại. Customer 360° tổng hợp dữ liệu liên hệ, Deal và Activity để Sale xem nhanh bối cảnh trước cuộc gọi hoặc cuộc họp. Phân quyền sở hữu giới hạn khả năng truy cập theo vai trò và quyền sở hữu hồ sơ.")
heading("3.3 Deal và bảng cơ hội", 2)
para("Deal có sáu giá trị giai đoạn trong dữ liệu: Prospecting, Qualification, Proposal, Negotiation, Won và Lost. Giao diện bảng Kanban gom các thẻ vào năm cột hiển thị (các giai đoạn đầu được quy về cột Lead), hỗ trợ kéo thả đổi giai đoạn, xem lịch sử và xóa có xác nhận. Kết quả WON cần giá trị hợp đồng thực tế và ngày chốt; LOST cần lý do. Phiên bản bản ghi giúp phát hiện xung đột khi cập nhật đồng thời; lịch sử ghi nhận thay đổi giai đoạn, giá trị, người thao tác và ghi chú.")
heading("3.4 Danh mục sản phẩm và dịch vụ", 2)
para("Danh mục có SKU, tên, mô tả, đơn giá, tiền tệ và trạng thái kinh doanh. Người có quyền quản trị danh mục có thể tạo/sửa và kích hoạt hoặc ngừng kinh doanh mặt hàng. Khi lập báo giá, sản phẩm được lọc theo tiền tệ của Deal; máy chủ kiểm tra dữ liệu và tính tổng dựa trên giá hiện tại của danh mục khi lưu.")
heading("3.5 Báo giá và phê duyệt", 2)
para("Báo giá gắn với Deal và Account, có mã số, trạng thái thương mại, hiệu lực, tiền tệ, danh sách dòng hàng, số lượng thập phân, đơn giá, chiết khấu từng dòng, VAT, tổng tiền và trạng thái phê duyệt. Người dùng có thể lưu bản nháp, chuyển trạng thái, đề nghị phê duyệt và nhận quyết định của người có quyền. Quote history ghi các sự kiện trạng thái, yêu cầu/ra quyết định phê duyệt và tạo phiên bản; phiên bản có mã nhóm và liên kết đến bản trước. PDF có thể xem trước trong ứng dụng và tải xuống.")
heading("3.6 Task, Activity, thông báo và lịch hẹn", 2)
para("Task có tiêu đề, mô tả, trạng thái mở/đang thực hiện/hoàn tất/đã hủy, độ ưu tiên, hạn và người được giao; có thể liên kết với Lead, Account, Contact hoặc Deal. Activity lưu loại tương tác, tiêu đề, chi tiết, thời điểm và đối tượng liên quan. Lịch có chế độ xem tháng/tuần, tạo, cập nhật, hủy hoặc hoàn thành cuộc hẹn; chuỗi định kỳ hỗ trợ hàng tuần/hàng tháng và sinh trước các lần phát sinh trong khoảng 30 ngày tiếp theo theo bộ lập lịch.")
para("Khi Telegram được cấu hình, bộ lập lịch của ứng dụng kiểm tra mỗi năm phút các Task đang mở đến hạn trong khoảng 15–30 phút tới. Gửi tối đa ba lần thử và lưu thời điểm đã thông báo thành công; cần Telegram Bot Token và Chat ID cho từng Sale đã bắt đầu trò chuyện với bot.")
heading("3.7 Phân tích bán hàng và Gemini AI", 2)
para("API KPI tổng hợp Lead và Deal trong phạm vi người dùng, cho phép lọc ngày bắt đầu/kết thúc. Phễu thể hiện phân bố Lead và Deal. Báo cáo hiệu suất Sale hỗ trợ ngày, tuần (thứ Hai đến Chủ nhật), tháng và quý; số liệu doanh thu được nhóm riêng theo đơn vị tiền tệ. Tỷ lệ thắng được tính bằng Deal Won chia tổng Deal Won và Lost; tỷ lệ chuyển đổi Lead là Lead Converted chia Lead đang hoạt động.")
para("Gemini có hai luồng chính: tóm tắt hoạt động (nhu cầu, cảm nhận, bước tiếp theo) và Customer 360 Copilot (điểm sức khỏe quan hệ, tóm tắt điều hành, điểm nhấn, rủi ro, cơ hội, hành động gợi ý, email và kịch bản gọi điện). Đề xuất hành động có thể chuyển thành Task. Khóa Gemini và model được cấu hình qua biến môi trường. Tóm tắt Activity có chức năng che email, số điện thoại, URL, định danh dài, thông tin xác thực và tên đã biết trước khi dựng ngữ cảnh gửi mô hình. Luồng Customer 360 xây ngữ cảnh Account/Contact/Deal/Activity riêng; việc xử lý dữ liệu khách hàng qua dịch vụ AI bên ngoài cần được đối tác chấp thuận theo chính sách dữ liệu trước khi bật.")

heading("04  Vai trò người dùng và kiểm soát dữ liệu", 1)
table(["VAI TRÒ", "NHIỆM VỤ ĐIỂN HÌNH", "PHẠM VI QUYỀN ĐƯỢC THỂ HIỆN"], [
    ("Admin", "Quản trị người dùng, vai trò và cấu hình vận hành.", "Các tuyến quản trị người dùng yêu cầu quyền Admin; một số dữ liệu/đối tượng có phạm vi toàn hệ thống."),
    ("Manager", "Điều phối bán hàng, quản lý danh mục và theo dõi đội ngũ.", "Được phép ở các thao tác cần Manager hoặc Admin, gồm quản lý sản phẩm và báo cáo hiệu suất Sale."),
    ("Sale", "Quản lý Lead/khách hàng được giao, Deal, báo giá, Task, lịch hẹn và Activity.", "Các API áp dụng phạm vi sở hữu/phân công; dữ liệu KPI dùng cùng phạm vi truy cập của người gọi."),
], [0.85, 2.25, 3.4])
para("Cơ chế xác thực dùng JWT truy cập ngắn hạn trong cookie HttpOnly, cookie làm mới có thời hạn riêng và thu hồi phiên qua refresh-token lưu trong cơ sở dữ liệu. API kiểm tra tài khoản đang hoạt động và vai trò ở phía máy chủ. Ứng dụng có giới hạn thử đăng nhập/đặt lại mật khẩu trong các luồng được cấu hình, kiểm tra đầu vào và phân trang danh sách.")
para("Quyền cụ thể phụ thuộc endpoint và quan hệ sở hữu dữ liệu. Trước bàn giao, hai bên nên duyệt ma trận quyền theo từng thao tác và xác nhận các trường hợp chuyển giao nhân sự, Sale đổi phụ trách, Admin truy cập hồ sơ và báo cáo tổng hợp.")

heading("05  Kiến trúc ứng dụng và thành phần kỹ thuật", 1)
table(["LỚP", "THÀNH PHẦN", "VAI TRÒ"], [
    ("Giao diện web", "HTML, CSS, JavaScript; Flask phục vụ trang; Vite/React và DnD Kit cho bảng Deal.", "Màn hình CRM, danh sách khách hàng, dashboard, báo giá, lịch, Task và tương tác API."),
    ("API và nghiệp vụ", "Python 3.12 container; Flask; Waitress ở chế độ triển khai.", "Xác thực, phân quyền, kiểm tra dữ liệu, nghiệp vụ CRM, tích hợp PDF, Gemini và Telegram."),
    ("Lưu trữ", "MySQL Server 8; MySQL Connector/Python với pool giới hạn 10 kết nối.", "Dữ liệu quan hệ, trạng thái, lịch sử, chỉ mục tra cứu và thông tin xác thực đã băm."),
    ("Triển khai", "Docker Compose: dịch vụ MySQL và API; volume duy trì dữ liệu.", "Khởi động có kiểm tra sức khỏe DB/API, cấu hình qua biến môi trường."),
    ("Tự động hóa chất lượng", "GitHub Actions trên push và pull request.", "Cài dependency, chạy unittest, kiểm tra cú pháp JavaScript và kiểm tra cấu hình Compose."),
], [1.0, 2.45, 3.05])
para("Đường đi điển hình: trình duyệt gửi yêu cầu đến Flask; API xác thực phiên, kiểm tra vai trò và phạm vi sở hữu; tầng nghiệp vụ truy vấn MySQL qua kết nối tham số hóa; phản hồi JSON về giao diện. Ứng dụng dùng transaction cho các thao tác cần cập nhật nhiều bảng đồng bộ.")
heading("Cấu trúc mã nguồn", 2)
table(["THƯ MỤC / TỆP", "NỘI DUNG CHÍNH"], [
    ("apps/web/", "Giao diện, tài nguyên tĩnh, template và bundle Deal board."),
    ("packages/api/app.py", "Flask app, API, xác thực, nghiệp vụ, PDF báo giá và vòng nhắc Telegram."),
    ("packages/api/gemini_service.py", "Dịch vụ Gemini, schema kết quả, tạo ngữ cảnh và che thông tin cho tóm tắt Activity."),
    ("packages/api/sql/", "Schema MySQL, 11 migration và dữ liệu demo."),
    ("scripts/ và .github/workflows/", "Lệnh chạy bộ kiểm thử và pipeline CI."),
], [2.1, 4.4])

heading("06  Mô hình dữ liệu và tích hợp bên ngoài", 1)
para("Schema hiện có 21 bảng. Các nhóm dữ liệu quan trọng bao gồm danh tính và phiên, khách hàng, cơ hội, thương mại, điều phối công việc, nhật ký hệ thống và tiện ích môi trường phát triển.")
table(["NHÓM", "BẢNG CHÍNH", "QUAN HỆ / Ý NGHĨA"], [
    ("Tài khoản", "roles, users, refresh_tokens, password_reset_tokens", "Vai trò, người dùng, phiên làm mới và token đặt lại mật khẩu."),
    ("Khách hàng", "leads, accounts, contacts", "Lead có thể chuyển thành Account; Contact thuộc Account; lưu chủ sở hữu và thông tin liên hệ."),
    ("Cơ hội", "deals, deal_history", "Deal liên kết Account/Contact và chủ sở hữu; lịch sử lưu thay đổi giai đoạn/giá trị."),
    ("Thương mại", "products, quotes, quote_items, quote_history", "Báo giá gắn Deal/Account, có dòng hàng, phê duyệt, phiên bản và lịch sử."),
    ("Thực thi", "tasks, appointment_series, appointments, activities, notifications", "Giao việc, chuỗi lịch lặp, lịch hẹn, tương tác và thông báo trong ứng dụng."),
    ("Quản trị", "audit_logs, dev_mailbox", "Audit JSON cho thao tác được ghi nhận; mailbox phát triển phục vụ luồng đặt lại mật khẩu ở môi trường dev."),
], [1.05, 2.4, 3.05])
heading("Tích hợp", 2)
table(["DỊCH VỤ", "MỤC ĐÍCH", "CẤU HÌNH / ĐIỀU KIỆN"], [
    ("Google Gemini API", "Tạo tóm tắt hoạt động và Copilot cho hồ sơ khách hàng.", "GEMINI_API_KEY; GEMINI_MODEL tùy chọn. Cần phê duyệt chính sách dữ liệu, quota, chi phí và model phù hợp."),
    ("Telegram Bot API", "Gửi nhắc Task sắp đến hạn cho nhân viên.", "TELEGRAM_BOT_TOKEN và telegram_chat_id cho mỗi Sale; người dùng phải bắt đầu chat với bot."),
    ("Email", "Mã nguồn có luồng quên/đặt lại mật khẩu và bảng mailbox phát triển.", "Giao email thật không được cấu hình trong hướng dẫn hiện tại; cần chốt nhà cung cấp và mẫu email trước khi đưa vào vận hành."),
], [1.25, 2.4, 2.85])
para("Các tích hợp tùy chọn cần được bật có chủ đích. Việc cung cấp khóa dịch vụ, phê duyệt truyền dữ liệu, hạn mức sử dụng, lưu trữ bí mật và người chịu trách nhiệm vận hành là đầu vào bàn giao của môi trường đích.")

heading("07  Bảo mật, chất lượng và khả năng quan sát", 1)
heading("Kiểm soát được thể hiện trong mã nguồn", 2)
for text in [
    "Mật khẩu được băm bằng bcrypt; xác thực JWT ký HS256, có issuer/audience, token truy cập 15 phút và refresh token có cơ chế thu hồi.",
    "Cookie đặt cờ HttpOnly, SameSite=Lax; bật Secure khi NODE_ENV=production và giới hạn path theo API.",
    "Ở production, ứng dụng từ chối khởi động nếu JWT secret không được cấu hình rõ ràng với độ dài tối thiểu 32 ký tự.",
    "API áp dụng decorator xác thực và kiểm tra vai trò; các truy vấn phạm vi khách hàng/Deal/Task/Lịch hẹn áp dụng quyền sở hữu hoặc phân công.",
    "Phản hồi có các header X-Content-Type-Options, X-Frame-Options, Referrer-Policy và Content-Security-Policy; giới hạn kích thước request 16 KB.",
    "Thao tác dữ liệu dùng tham số truy vấn; các thao tác cập nhật nhiều bản ghi dùng transaction; một số entity có lịch sử và bảng audit log.",
    "Container chạy bằng user hệ thống không phải root. Compose chỉ bind cổng ứng dụng vào loopback 127.0.0.1 và DB nội bộ trên mạng Compose.",
]:
    bullet(text)
heading("Điểm cần rà soát trước triển khai chính thức", 2)
para("Các kiểm soát ở tầng ứng dụng là nền tảng để tiếp tục đánh giá, không thay thế cấu hình mạng, TLS, sao lưu/khôi phục, giám sát, kiểm soát quyền quản trị hạ tầng, quét lỗ hổng và kiểm thử bảo mật độc lập. Đối tác nên rà soát CSRF/cookie trong mô hình truy cập dự kiến, chính sách lưu trữ/xóa dữ liệu và cách bảo vệ khóa tích hợp. Đặc biệt, cần xem xét riêng việc đưa dữ liệu hồ sơ khách hàng sang Gemini theo luồng Customer 360.")
heading("Kiểm thử và giám sát", 2)
para("Kho dự án có unittest cho API và các nhóm như báo giá, lịch hẹn, sản phẩm, phân tích và Gemini; GitHub Actions được cấu hình chạy suite Python, kiểm tra cú pháp frontend và kiểm tra Compose. Báo cáo này không thực thi suite nên không khẳng định kết quả pass/fail ở commit hiện tại. API có endpoint health, header thời gian phản hồi, Server-Timing và ghi log cảnh báo khi request chậm trên 500 ms; lỗi máy chủ được ghi log và trả thông báo tổng quát.")

heading("08  Triển khai, cấu hình và vận hành", 1)
heading("Yêu cầu nền tảng", 2)
bullet("Chạy trực tiếp: Python 3.11 trở lên, MySQL 8.0 trở lên; môi trường hướng dẫn sử dụng PowerShell trên Windows.")
bullet("Chạy container: Docker và Docker Compose; image MySQL 8.0 và image Python 3.12 slim.")
bullet("Node.js/npm chỉ cần khi sửa và dựng lại bundle React của bảng Deal; bản bundle đã có sẵn để chạy ứng dụng.")
heading("Triển khai bằng Docker Compose", 2)
for text in [
    "Cấp thông tin DB và bí mật triển khai: DEPLOY_DB_PASSWORD, MYSQL_ROOT_PASSWORD và DEPLOY_JWT_SECRET duy nhất, tối thiểu 32 ký tự.",
    "Chuẩn bị cấu hình tùy chọn cho Gemini và Telegram nếu các luồng này được duyệt đưa vào sử dụng.",
    "Khởi động dịch vụ; MySQL nạp schema vào volume mới và API đợi health check DB trước khi chạy.",
    "Xác nhận /api/health, đăng nhập, kết nối DB, log, truy cập ứng dụng và cấu hình reverse proxy/TLS của môi trường đích.",
    "Theo dõi dịch vụ và chính sách sao lưu volume nexus_mysql_data; dừng stack không xóa dữ liệu. Xóa volume là thao tác xóa dữ liệu có chủ đích.",
]:
    numbered(text)
para("Schema chỉ được nạp tự động cho volume MySQL mới. Cơ sở dữ liệu cũ không tự chạy migration khi khởi động; nhóm vận hành cần xác định phiên bản schema và áp dụng tuần tự các migration phù hợp trước khi nâng cấp.")
heading("Quản lý thay đổi dữ liệu", 2)
para("Tài liệu cài đặt liệt kê migration 001–011, gồm ràng buộc trùng Lead, chỉ mục, xóa mềm Lead, version Deal, trường chốt Deal, nhắc Telegram, lịch lặp, phê duyệt báo giá, tổng tiền thập phân, version báo giá và chỉ mục phục vụ khách hàng/Deal/Task. Trước khi áp dụng migration, cần sao lưu, xác định trạng thái schema và ghi nhận kế hoạch hoàn nguyên phù hợp với phiên bản MySQL và quy trình của đối tác.")

heading("09  Bằng chứng sẵn có và tiêu chí nghiệm thu", 1)
table(["HẠNG MỤC", "BẰNG CHỨNG TRONG DỰ ÁN", "KIỂM TRA KHI NGHIỆM THU"], [
    ("API và giao diện", "Route Flask, trang CRM và logic frontend trong apps/web.", "Đăng nhập theo từng vai trò; duyệt các luồng Lead, Account, Deal, báo giá, Task và lịch."),
    ("Dữ liệu", "Schema MySQL, khóa ngoại, chỉ mục, 11 migration.", "Cài schema mới; nâng cấp DB mẫu từ phiên bản đã thống nhất; kiểm tra quan hệ và tìm kiếm."),
    ("Quyền truy cập", "Decorator xác thực/role và scope theo user; kiểm tra API trong test.", "Thử truy cập chéo giữa Sale, Manager, Admin và hồ sơ không được giao."),
    ("Tự động hóa kiểm thử", "Test Python và workflow GitHub Actions.", "Chạy suite trên commit bàn giao; lưu kết quả CI và xử lý lỗi trước nghiệm thu."),
    ("Vận hành container", "Dockerfile và compose health check.", "Build, khởi động, khởi động lại, kiểm tra health check, volume và sao lưu/khôi phục."),
    ("Tích hợp ngoài", "Module Gemini và Telegram có kiểm tra cấu hình/lỗi.", "Chỉ bật sau khi cấp credential, xác nhận dữ liệu được chia sẻ, giới hạn và người sở hữu dịch vụ."),
], [1.2, 2.55, 2.75])
heading("Đề xuất điều kiện hoàn thành", 2)
for text in [
    "Biên bản thống nhất phiên bản source/schema và cấu hình môi trường; không còn bí mật phát triển hoặc tài khoản demo trong dữ liệu bàn giao.",
    "Các luồng nghiệp vụ trọng yếu được chạy trên môi trường đích với dữ liệu mẫu do đối tác phê duyệt.",
    "Bộ kiểm thử và CI chạy thành công trên commit bàn giao; lỗi mức nghiêm trọng/cao có phương án xử lý được chấp thuận.",
    "Ma trận quyền, chính sách backup/restore, giám sát, đầu mối xử lý sự cố và SLA vận hành được ký xác nhận.",
    "Tích hợp Gemini/Telegram/email được xác nhận bật hoặc tắt, có chủ sở hữu credential và quy trình xoay vòng/thu hồi.",
]:
    bullet(text)

heading("10  Các điểm cần xác nhận với đối tác", 1)
table(["CHỦ ĐỀ", "CÂU HỎI CẦN CHỐT", "ĐẦU RA BÀN GIAO"], [
    ("Mục tiêu sử dụng", "Nhóm Sale, Manager, Admin, số lượng người dùng và quy trình ưu tiên là gì?", "Ma trận nghiệp vụ, vai trò và phạm vi dữ liệu."),
    ("Hạ tầng", "Đối tác triển khai Docker hay nền tảng khác? Có reverse proxy, TLS, DNS và giám sát nào?", "Sơ đồ môi trường, endpoint, cổng, backup và quy trình phục hồi."),
    ("Dữ liệu", "Dữ liệu nào được nhập? Quy tắc trùng lặp, lưu giữ, xóa và chủ sở hữu dữ liệu ra sao?", "Mẫu import, mapping, quy tắc chất lượng và chính sách vòng đời."),
    ("AI và quyền riêng tư", "Có cho phép gửi dữ liệu CRM tới Google Gemini không? Trường nào được xử lý?", "Quyết định bật/tắt, danh sách dữ liệu, model, quota và thông báo người dùng."),
    ("Thông báo", "Telegram/email có dùng không; ai sở hữu bot, chat ID, SMTP và luồng reset mật khẩu?", "Credential trong secret manager và đầu mối vận hành."),
    ("Báo giá", "Mẫu PDF, ngôn ngữ, tiền tệ, VAT, chính sách làm tròn và cấp duyệt nào áp dụng?", "Mẫu được duyệt và bảng quy tắc thương mại."),
    ("Vận hành", "Ai theo dõi DB, log, sự cố, nâng cấp schema và quyền quản trị?", "Runbook, RACI, lịch bảo trì, SLA và kênh hỗ trợ."),
], [1.1, 3.05, 2.35])

heading("11  Đề xuất kế hoạch tiếp nhận và bàn giao", 1)
table(["GIAI ĐOẠN", "HOẠT ĐỘNG", "ĐẦU RA"], [
    ("1. Chốt phạm vi", "Xác nhận vai trò, luồng nghiệp vụ, tiền tệ, phê duyệt báo giá, AI và thông báo.", "Tài liệu yêu cầu/ma trận quyền đã được hai bên chấp thuận."),
    ("2. Chuẩn bị môi trường", "Cấp host, DB, TLS, secret, tài khoản quản trị; thống nhất backup và monitor.", "Môi trường test có health check và runbook."),
    ("3. Nạp và đối soát dữ liệu", "Ánh xạ Lead/Account/Contact/Deal/Products; kiểm soát trùng và owner.", "Bộ dữ liệu thử và biên bản đối soát."),
    ("4. Kiểm thử nghiệp vụ", "Chạy kịch bản theo vai trò: chuyển đổi Lead, chốt Deal, báo giá, Task, lịch, dashboard.", "Kết quả test, danh sách lỗi và quyết định xử lý."),
    ("5. UAT và đào tạo", "Người dùng chủ chốt xác nhận luồng; hướng dẫn vận hành và thao tác an toàn.", "Biên bản UAT, hướng dẫn người dùng và đầu mối hỗ trợ."),
    ("6. Go-live có kiểm soát", "Chốt cửa sổ triển khai, backup, migration, xác nhận dịch vụ ngoài và giám sát.", "Biên bản đưa vào sử dụng, theo dõi sau phát hành và kế hoạch hoàn nguyên."),
], [1.15, 3.05, 2.3])
para("Thời lượng từng giai đoạn cần được chốt theo quy mô dữ liệu, hạ tầng, mức tùy chỉnh và yêu cầu an toàn thông tin của đối tác.")

pagebreak()
heading("Phụ lục A  Danh mục API theo nhóm nghiệp vụ", 1)
para("Danh mục dưới đây tóm tắt các endpoint chính nhìn thấy trong backend; quyền truy cập và payload chi tiết phụ thuộc vai trò, tham số và quy tắc dữ liệu.")
table(["NHÓM", "ENDPOINT TIÊU BIỂU", "CHỨC NĂNG"], [
    ("Tình trạng dịch vụ", "GET /api/health", "Kiểm tra sức khỏe ứng dụng."),
    ("Xác thực", "POST /api/auth/login, refresh, logout, forgot-password, reset-password; GET /api/auth/me", "Đăng nhập, duy trì phiên, thoát và đặt lại mật khẩu."),
    ("Người dùng", "GET/POST /api/admin/users; PATCH/DELETE /api/admin/users/{id}", "Quản trị tài khoản theo quyền Admin."),
    ("Lead", "GET/POST /api/leads; PUT/DELETE /api/leads/{id}; PATCH assign; POST convert", "Tìm, tạo, cập nhật, giao và chuyển đổi Lead."),
    ("Khách hàng", "GET/POST /api/accounts, /api/contacts; GET /api/customers/accounts/{id}; GET /api/customers/leads", "Quản lý Account/Contact và hồ sơ Customer 360."),
    ("Deal", "GET/POST /api/deals; PATCH/PUT/DELETE /api/deals/{id}; PATCH stage; GET history", "Quản lý pipeline, giai đoạn và lịch sử Deal."),
    ("Sản phẩm", "GET/POST /api/products; GET/PATCH/PUT/DELETE /api/products/{id}", "Danh mục sản phẩm/dịch vụ."),
    ("Báo giá", "GET/POST /api/quotes; GET/PATCH/PUT /api/quotes/{id}; approval-request, approval, status, pdf", "Tạo báo giá, phê duyệt, theo dõi và xuất PDF."),
    ("Công việc", "GET/POST /api/tasks; PATCH/PUT /api/tasks/{id}; GET assignees", "Giao và cập nhật Task."),
    ("Lịch hẹn", "GET/POST /api/appointments; GET/PATCH/PUT/DELETE /api/appointments/{id}; DELETE series", "Lịch hẹn đơn lẻ/định kỳ."),
    ("Hoạt động", "POST /api/activities; POST /api/ai/summarize", "Ghi nhận tương tác và tóm tắt hoạt động bằng AI."),
    ("Phân tích", "GET /api/analytics/kpis, /funnel, /sales-performance", "KPI, phễu và hiệu suất Sale theo kỳ."),
    ("Gemini Copilot", "POST /api/customers/accounts/{id}/gemini-summary", "Tạo tóm tắt chiến lược Customer 360."),
], [1.05, 3.0, 2.45], 7.9)

heading("Phụ lục B  Danh mục tài liệu kỹ thuật đã đối chiếu", 1)
table(["NGUỒN TRONG KHO", "NỘI DUNG DÙNG ĐỂ ĐỐI CHIẾU"], [
    ("README.md", "Yêu cầu cài đặt, luồng chạy, tích hợp AI/Telegram, analytics, migrations và deployment."),
    ("packages/api/app.py", "API, nghiệp vụ, xác thực/phân quyền, PDF báo giá, health/security headers và scheduler Telegram."),
    ("packages/api/gemini_service.py", "Schema Copilot, tạo ngữ cảnh, xử lý lỗi và che dữ liệu cho tóm tắt hoạt động."),
    ("packages/api/sql/schema.mysql.sql và migrations 001–011", "Bảng, quan hệ, chỉ mục và nâng cấp schema."),
    ("docker-compose.yml, Dockerfile, packages/api/serve.py", "Dịch vụ container, cấu hình mạng/volume, user runtime và máy chủ Waitress."),
    ("apps/web/static/app.js, apps/web/src/deal-board.jsx, templates và styles", "Màn hình và luồng thao tác trên giao diện."),
    ("packages/api/test_*.py, scripts/run_tests.ps1, .github/workflows/tests.yml", "Phạm vi test và lệnh CI được cấu hình."),
], [2.65, 3.85])
para("Ghi chú bàn giao: phiên bản thực tế cần đối chiếu với commit/tag được triển khai. Môi trường đối tác cần được nghiệm thu độc lập bằng cấu hình, dữ liệu, phân quyền và tích hợp đã được hai bên thống nhất.")

doc.core_properties.title = "Báo cáo tổng quan dự án Nexus CRM"
doc.core_properties.subject = "Báo cáo chức năng, kiến trúc, vận hành và bàn giao đối tác"
doc.core_properties.author = "Nexus CRM Project Team"
doc.core_properties.keywords = "Nexus CRM, báo cáo dự án, bàn giao"
doc.save(OUT)
print(OUT)
