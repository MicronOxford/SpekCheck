#Definition file to define the configuration of
#channels for out spectral calcultor
Channels=[
    #OMX V3 Live cell Drawer
('OMX_V3','Live_YFP',(('R-0056','R'),('EM-550-49','R'))),
('OMX_V3','Live_RFP',(('R-0056','T'),('R-0048','R'),('R-0053','T'),
                      ('EM-629-53','R'))),
('OMX_V3','Live_CFP',(('R-0056','T'),('R-0048','R'),('R-0053','R'),
                      ('EM-482-35','R'))),

    #OMX V3 standard drawer.
    ('OMX_V3','Std_GFP',(('R-0063','R'),('R-0054','T'),('EM-525-50','R'))),
    ('OMX_V3','Std_Cy5',(('R-0063','R'),('R-0054','R'),('EM-684-40','R'))),
    ('OMX_V3','Std_DAPI',(('R-0063','T'),('R-0039','R'),('R-0058','T'),
                          ('EM-442-46','R'))),
    ('OMX_V3','Std_RFP',(('R-0063','T'),('R-0039','R'),('R-0058','R'),
                          ('EM-615-24','R'))),

    

]

ChannelFormat=['microscope','channel','filter-definition']
