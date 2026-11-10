                             **Junk Analysis**

# **JGU Online – Weekly Junk Analysis Process**

Sheet Link for reference: [https\://purviewdigital-my.sharepoint.com/:x:/p/yash\_gandhi/IQDdlR0D91H1TaKkFNPoIuuHAZvC4HbXVhnWVFT\_LHWxgi0?e=gCjpDW](https://purviewdigital-my.sharepoint.com/:x:/p/yash_gandhi/IQDdlR0D91H1TaKkFNPoIuuHAZvC4HbXVhnWVFT_LHWxgi0?e=gCjpDW)

## **Weekly Performance (JGU) – Programme-wise**

### **Part 1:**

### **Step 2: Open Weekly Junk in Meritto**

1. Open **Meritto**.  
2. Click **Lead Manager → Manage Leads**.  
3. Go to **User Registration Date**.  
4. Select a custom range: Last Monday to Sunday.  
5. Click the blue **Apply** button.

### **Step 3: Customise Columns**

1. On the top right, beside the Search button, click **Customise Columns**.  
2. Click **Columns**.  
3. Add **Course, Primary Registration Campaign.**  
4. Click **Apply**.

### **Step 4: Download Leads**

1. Click **Download Leads** (fourth option in the same section).  
2. Click **View Export**.  
3. Search for **the course** and select it.  
4. Click **Apply**.  
5. Choose **CSV** format.  
6. Click **Download**.  
7. Click **View Export Status**.  
8. You will be redirected to the **User Request Report** page.  
9. Wait approximately 10 seconds and refresh the page.  
10. In the first row (latest downloaded report), go to the last column.  
11. Click the **three dots** beside **0 (zero)**.  
12. Download the file.

### **Step 5: Create a Pivot Table**

1. 1\. Open the downloaded file in Excel.  
2. Select the data and insert a **Pivot Table**.  
3. Arrange the fields as follows:

| Rows | Columns | Values |
| ----- | ----- | ----- |
| Course | Lead Stage | Lead Stage (Count) |

### **Step 6: Remove Unwanted Courses**

1. Check which programmes are managed by the team.  
2. Apply a filter to the Course column.  
3. Remove the following:  
   * BACHELOR OF SCIENCE IN PSYCHOLOGY  
   * COURSE NOT AVAILABLE  
   * M.SC. IN FAMILY BUSINESS  
   * M.SC. IN STRATEGIC COMMUNICATION  
   * MASTER'S OF DESIGN IN USER EXPERIENCE  
   * (blank)

### **Step 8: Update the Weekly Performance Sheet**

1. After **Grand Total**, add these five columns:

| Junk | Junk % | Application Started | Application Submitted | Enrollment Done |
| :---: | :---: | :---: | :---: | :---: |

2. Add the 3 columns' sum into 1 column as **Junk**:  
   * Financial Barrier  
   * Junk  
   * Not Interested in the Programme

3\. Calculate **Junk %** using the Junk count and total leads.

---

## **Part 2: Enrollment Done**

### **Step 10: Open Application Manager**

1. Open **Meritto**.  
2. Click **Application Manager → Manage Application**.  
3. On the top-left, click **Advanced Filter**.

### **Step 11: Apply Enrolment Filters**

1. Click **Select Field**.  
2. Select **Enrolment Status**.  
3. Select **Equal**.  
4. Select **Yes**.  
5. Click the **\+** icon.  
6. Select **Enrolment Date**.  
7. Select **Between**.  
8. Enter the required date range (last 7 days).  
9. Click **Apply**.

### **Step 12: Download Application Data**

1. Select **Course** in the columns.  
2. Click **Download Application**.  
3. **Click Here**.  
4. Wait approximately 10 seconds.  
5. Refresh the page.  
6. Go to the first row (latest downloaded report).  
7. In the last column, click the **three dots** beside **0 (zero)**.  
8. Download the file.

### **Step 13: Create an Enrolment Pivot Table**

1. Open the downloaded file in Excel.  
2. Insert a **Pivot Table**.  
3. Arrange the fields:

| Rows | Values |
| ----- | ----- |
| Course | Course (Count) |

4.   
   Apply a filter and remove programmes not managed by the team.  
5. Copy the filtered pivot table.  
6. Paste it into the **Weekly Performance (JGU)** Excel sheet.  
7. Apply **VLOOKUP** to fill the **Enrollment Done** column.

---

## **Part 3: Application Started & Application Submitted**

### **Step 14: Apply Filters in Meritto**

1. Open **Meritto**.  
2. Click **Application Manager → Manage Leads**.  
3. Click **Advanced Filter**.  
4. Select **Enrolment Status**.  
5. Select **Equal → No**.  
6. Click the **\+** icon.  
7. Select **Form Starting Date**.  
8. Select **Between**.  
9. Enter the required date range.  
10. Click **Apply**.

### **Step 15: Download Application Data**

1. Select **Course** in the columns.  
2. Click **Application Download**.  
3. Download the file.  
4. Open the downloaded file in Excel.

### **Step 16: Create an Application Pivot Table**

1. Select the data and insert a **Pivot Table**.  
2. Arrange the fields:

| Rows | Columns | Values |
| ----- | ----- | ----- |
| Course | Payment Status | Payment Status (Count) |

3.   
   Identify the payment-status columns:  
   * **Payment Pending \= Application Started**  
   * **Payment Approved \= Application Submitted**  
4. Copy the pivot table.  
5. Paste it into the **Weekly Performance (JGU)** Excel sheet.  
6. Apply **VLOOKUP** to fill:  
   * Application Started  
   * Application Submitted

---

## **JGU ONLINE (Campaign wise)**

Same process for campaign-wise. Just added an extra row in Step 5\.

### **Step 5: Create a Pivot Table**

1. Open the downloaded file in Excel.  
2. Select the data and insert a **Pivot Table**.  
3. Arrange the fields as follows:

| Rows | Columns | Values |
| ----- | ----- | ----- |
| Course Primary Registration Campaign | Lead Stage | Lead Stage (Count) |

For reference- ![][image1]

*Note- We do not add **Application Started, Application Submitted and Enrollment Done** in Campaign Wise report.*  
---

[image1]: <data:image/png;base64,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>