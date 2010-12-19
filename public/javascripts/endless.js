var Endless = {
};// The namespace object
Endless.Options = {
  checkInterval:  1,  //更新轮询的时间，秒
  scrollThreshold : 50,      //判断滚动条的距离
  errorThreshold : 3, //后台出错之后，最大尝试重新取几次
  outerHeight: 250    //除了div.scroll_container之外，其他元素要占据的高度，
  //div.scroll_container的高度将会是: document.viewport.getHeight() - outerHeight
}
//Endless.Page
Endless.Page = Class.create({
  initialize: function(element) {
    //根据构造参数初始化一些变量
    this.element = $(element);
    this.base_url = this.element.readAttribute("url");
    // Options是放在 div.endless里面额外的属性
    var options = Object.keys(Endless.Options).inject({}, function(acc,attr){
      var option = element.readAttribute(attr);
      if( option != null ) acc[attr] = option;
      return acc;
    });
    this.options = Endless.Options;
    Object.extend(this.options, options);
    //初始化Page的出错次数
    this.error = 0;
    //初始化Page Properties信息
    this.properties = {
      currentPage  : 1,
      totalEntries : 0,
      totalPages   : 2,
      perPage      : 0,
      fetchedSize  : 0
    }

   //初始化组成对象
    var domToolbar = this.element.select("table.toolbar").first();
    var domTable = this.element.select("div.endless_table").first();
    var domStatusbar = this.element.select("table.statusbar").first();
    this.toolbar = new Endless.Toolbar(this, domToolbar);
    this.table = new Endless.Table(this, domTable);
    this.statusbar = new Endless.Statusbar(this, domStatusbar);
    this.adjustHeight();
    Event.observe(window, 'resize', this.adjustHeight.bindAsEventListener(this))
  },

  hasMorePage : function(){
    return this.currentPage() < this.totalPages();
  },

  adjustHeight: function(){
    var container = this.element.down("div.scroll_container");

    var height = document.body.clientHeight - this.options.outerHeight;
    container.setStyle({height: height});
  },

  overErrorThreshold: function(){
    return this.error > this.options.errorThreshold;
  },

  clearError: function(){
    this.error = 0;
  },

  increaseError : function(){
    this.error++;
  },

  currentPage: function(){
    return this.properties.currentPage;
  },

  totalEntries: function(){
    return this.properties.totalEntries;
  },

  totalPages: function(){
    return this.properties.totalPages;
  },

  getCheckInterval : function(){
    return this.options.checkInterval;
  },
  getScrollThreshold : function(){
    return this.options.scrollThreshold;
  },

  /**
   * 所有的事件，最后都是通过page的element来生成
   */
  fire : function(eventName, memo){
    Event.fire(this.element, "endless:" + this.element.id + ":" + eventName, memo)
  },

  /**
   * 所有的事件，最后都是通过观察对应于page的element来监听
   */
  observe : function(eventName, observer, target){
    Event.observe(this.element, "endless:"+ this.element.id + ":" + eventName, observer)
  },

  activateButton : function(name){
    this.toolbar.getButton(name).activate();
  },

  checkAll : function(){
    this.table.selectionModel.checkAll();
  },
  checkNone : function(){
    this.table.selectionModel.checkNone();
  },

  getSelection: function(){
    return this.table.selectionModel.selection;
  },
  /**
   * 为某个元素声明的关于Page的事件属性注册监听器
   * page支持如下事件，element都可以声明:
   *  onSelectionChanged = Xxx.doSomething(src,evt)
   *  onFetchSuccess = Xxx.doOtherthing(srv,evt)
   *  onFetchFailure = xxx
   *  onFetchComplete
   */
  hookEventListeners : function(item){
    var page = this;
    //为StatusItem注册事件
    $w("onSelectionChanged onFetchSuccess onFetchFailure onFetchComplete").each(function(eventName){
      var target = item.element.readAttribute(eventName);
      if( target ) {
        var event = eventName.sub(/^on/, "");
        event = event.slice(0,1).toLowerCase() + event.slice(1, event.length);
        page.observe(event, Endless.Page.wrapEventListener(item, target))
      }
    })
  },

  reload : function(){
    this.table.reload();
  },
  /**
   * 通过点击某个Row内的Link，打开一个Row对象详细信息，并将其展现在其记录行之后
   */
  openDetail : function( link, event ) {
    if(event != null) {
      Event.stop(event);//不要再传递事件了
    }
    link = $(link)
    var tr = link.ancestors().find(function(element){
      return Endless.Util.isRecordRow(element);
    })
    var detailRow = tr.nextSiblings().first();
    if( detailRow != null && detailRow.hasClassName("detail") ){
      detailRow.toggle();
    }else{
      var href = encodeURI(link.href);
      new Ajax.Request(href, {
        asynchronous:false,
        method:'get',
        onSuccess:function(response){
          var cols = tr.select("td").size();
          var content = "<tr class='detail'><td style='width:5%'>&nbsp</td><td colspan='#{cols}'>#{body}</td></tr>"
          content = content.interpolate({
            cols:cols - 1,
            body:response.responseText
          })
          tr.insert( {
            after:content
          } );
        }
      })
    }
  }
})

Object.extend(Endless.Page, {
  /**
   *  其上下文对象说明了创建的模型名称和url
   */
  create : function(){
    try{
      var element = $$("div.endless").first();
      this.page = new Endless.Page(element);
      Endless.Page['instance'] = this.page;
    }catch(error){
      alert(error);
    }
  },
  getInstance : function(){
    return Endless.Page.instance;
  },
  wrapEventListener: function(source, target) {
    return function(event){
      eval(target);
    }
  }
})

Endless.Table = Class.create({
  initialize: function(page, element) {
    // 根据构造函数初始化成员变量
    this.page = page;
    this.element = $(element);
    // 根据HTML初始化对应的dom成员
    this.tbody = this.element.select("table.scrollable_body tbody").first();
    this.container = this.element.select("div.scroll_container").first();
    //初始化Group Model
    this.groupModel = new Endless.GroupModel(this);
    //初始化Column Model
    this.columnModel = new Endless.ColumnModel(this);
    //创建选择模型
    if( this.element.readAttribute("selection") == "single" ){
      this.selectionModel = new Endless.SingleSelectionModel(this);
    }else if( this.element.readAttribute("selection") == "none" ){
      this.selectionModel = new Endless.NoneSelectionModel(this);
    }else{
      this.selectionModel = new Endless.MultipleSelectionModel(this);
    }
    //Lock用于标记本表格是否正在抓取数据
    this.lock = false;
    //初始化的界面没有数据，默认就要抓取第一页
    this.fetch(1);
    //初始化发出一个选择变化事件，以便各方调整期状态
    this.page.fire("selectionChanged", this.selectionModel.selection);
  },

  /**
   * 检查滚动条，并决定加载数据;
   */
  checkScroll: function(){
    if (this.nearScrollBottom()) {
      if( this.page.hasMorePage() ){
        this.fetch(this.page.currentPage() + 1);
      }
    } else {
      this.checkScroll.bindAsEventListener(this).delay(this.page.getCheckInterval());
    }
  },
  /**
   * 抓取额外的页
   */
  fetch : function(pageIndex){
    if( this.lock ) return;
    try{
      this.lock = true
      var url = this.page.base_url;
      var connector = url.include("?") ? "&" : "?";
      url = url + connector + "page=" + pageIndex;
      url = url + "&" + this.columnModel.sortby();
      if( this.groupModel.currentGroup() != null && !this.groupModel.currentGroup().blank() ){
        url = url + "&current_group=" + this.groupModel.currentGroup();
      }
      url = encodeURI(url);
      new Ajax.Request(url,{
        asynchronous:true,
        method: 'GET',
        onSuccess: this.appendPage.bindAsEventListener(this),
        onFailure: this.fetchFailure.bindAsEventListener(this),
        onComplete: this.fetchComplete.bindAsEventListener(this)
      });
    }catch(e){
      this.lock = false;
    }
  },

  /**
   * 用户点击刷新，或者用户点击列头，要求排序时
   * 以Ajax的方式重新加载这个Table的数据
   */
  reload : function(column_name, direction){
    if( this.lock ) return;
    try{
      this.lock = true
      var url = this.page.base_url;
      var connector = url.include("?") ? "&" : "?";
      this.columnModel.sorting = {
        column : column_name,
        direction : direction
      }
      url = url + connector + this.columnModel.sortby(column_name, direction);
      url = encodeURI(url);
      new Ajax.Request(url,{
        asynchronous:true,
        method: 'GET',
        onSuccess: this.replacePage.bindAsEventListener(this),
        onFailure: this.fetchFailure.bindAsEventListener(this),
        onComplete: this.fetchComplete.bindAsEventListener(this)
      });
    }catch(e){
      this.lock = false;
    }
  },

  /**
   * 获取到一页数据之后，将数据加入HTML DOM树中，并让Endless.Table也进行管理
   */
  appendPage : function(response){
    this.page.clearError(); //清除错误，计数归零
    this.tbody.insert(response.responseText); //将内容插入
    this.selectionModel.hook(); //为新插入的内容行记录植入钩子
    this.groupModel.hook(); //为新插入的内容分组行植入钩子

    //统计当前有多少条
    this.page.properties.fetchedSize = this.tbody.select("input.selection").size();
    //从AJAX Response中读取当前页
    this.page.properties.currentPage = parseInt(response.getHeader("current_page"));
    //从AJAX Response中读取共有多少条
    this.page.properties.totalEntries = parseInt(response.getHeader("total_entries"));
    //从AJAX Response中读取共有多少页
    this.page.properties.totalPages = parseInt(response.getHeader("total_pages"));
    //从AJAX Response中读取每页大小
    this.page.properties.perPage = parseInt(response.getHeader("per_page"));
    //发出事件
    this.page.fire("fetchSuccess", this.page.properties);
  },

  /**
   * 点击列头进行排序时，对原有的分组/行等记录进行清除，并把AJAX响应结果插入
   */
  replacePage : function(response){
    this.page.clearError();
    //更新Column模型的状态
    this.columnModel.refresh();
    //清空选择
    this.selectionModel.checkNone();
    //清空GroupBar
    this.groupModel.clear();
    //先删除所有的行
    this.tbody.select("tr").each(function(tr){
      tr.remove();
    });
    //再把最新的结果加进去
    this.appendPage(response);
  },

  /**
   * AJAX远程数据抓取失败的后置处理函数
   */
  fetchFailure : function(){
    this.page.increaseError();
    this.page.fire("fetchFailure");
  },

  /**
   * AJAX远程数据抓取完成的后置处理函数
   * (无论成功失败都会调用)
   */
  fetchComplete : function(response){
    this.lock = false;//先解锁
    //连续多次错误后，不再继续尝试
    if( this.page.overErrorThreshold() ){
      Page.showError(response.responseText);
    } else{
      //延迟一会儿，继续检查Scroll情况
      this.checkScroll.bindAsEventListener(this).delay(this.page.getCheckInterval());
    }
    this.page.fire("fetchComplete",this.page.properties);
  },

  /**
   * 判断当前表格的Viewport是不是接近了Scroll bar的底部
   */
  nearScrollBottom : function(){
    var left = this.getContainerHeight() - this.getScrollHeight()
    return left < this.page.getScrollThreshold();
  },

  getContainerHeight : function(){
    var height  = this.container.scrollHeight > this.container.offsetHeight ? this.container.scrollHeight: this.container.offsetHeight
    return parseInt(height);
  },
  getScrollHeight : function(){
    var height = this.container.scrollTop;
    return parseInt(height)+ parseInt(this.container.clientHeight);
  }
})

/**
 * Endless Table的列模型，确切的讲，是列头模型Column Headers Model
 * 它并不是一个传统意义上的MVC Model
 * 其实只是Endless Table一部分相关逻辑的汇集
 */
Endless.ColumnModel = Class.create({
  initialize: function(table){
    this.table = table;
    this.columns = [];//ColumnHeader对象的数组，包括Selection Column Header
    var model = this;
    table.element.select("table.fixed_header th").each(function(th){
      model.columns.push(new Endless.ColumnHeader(table, th))
    })
  },
  refresh : function(){
    this.columns.each( function (column){
      column.reset();
    });
    if( this.sorting != null ){
      column = this.getColumn(this.sorting.column);
      if( column != null ){
        column.setDirection( this.sorting.direction );
      }
      this.sorting = null;
    }
  },
  /**
   * 得到排序参数
   */
  sortby : function(name, direction){
    if (name == undefined ) {
      var column = this.getSortingColumn();
      if ( column ) {
        name = column.name;
        direction = column.direction;
      }
    }
    var result = "";
    if( name ){
      result = "sortby=" + name;
      if( direction && !direction.blank() ){
        result = result + " " + direction;
      }
    }
    return result;
  },

  /**
   * 得到正在被排序的Column
   */
  getSortingColumn : function(){
    return this.columns.find( function(column){
      return column.isSorting();
    })
  },

  /**
   * 根据Column名称获取Column
   */
  getColumn : function(name) {
    if( name == null ) return null;
    return this.columns.find( function(column){
      return column.name == name;
    })
  }
})

Endless.ColumnHeader = Class.create({
  initialize: function(table, element){
    this.table = table;
    this.element = $(element);
    this.name = this.element.readAttribute("name");
    if (this.element.hasClassName("sortable")) {
      this.sortable = true;
      var span = this.element.select("span").first();
      span.observe('click', this.onColumnClick.bindAsEventListener(this))
    }
    if (this.element.hasClassName("asc")) {
      this.direction = "asc";
    }else if(this.element.hasClassName("desc")){
      this.direction = "desc";
    }else{
      this.direction = "";
    }
  },
  onColumnClick : function(){
    var new_direction;
    if( this.direction == "asc"){
      new_direction = "desc"
    }else if (this.direction == "desc") {
      new_direction = "";
    }else{
      new_direction = "asc";
    }
    try{
      this.table.reload(this.name, new_direction);
    }catch(error){
      alert(error);
    }
  },
  isSorting : function(){
    return this.direction == "asc" || this.direction == "desc";
  },
  setDirection : function( direction ) {
    this.direction = direction;
    this.element.addClassName(direction);
  },
  reset : function(){
    this.element.removeClassName("asc");
    this.element.removeClassName("desc");
    this.direction = "";
  }
})

/**
 * Endless Table的选择模型
 * 它并不是一个标准的MVC的Model
 * 在MVC Model里面, Table -> Model单向依赖
 * 而是一个Table关于模型功能的聚集；他们之间是双向依赖，紧密绑定
 * selection model更多的是一个被动表达了Table的Button选择状态
 */
Endless.SelectionModel = Class.create({
  initialize: function(table){
    this.table = table;
    this.selection = [];
  },

  hook : function(){
    var model = this;
    this.table.tbody.select("input.selection").each(function(button){
      //如果已经被观测，就不要再注册了
      if( button.readAttribute("observed") == "true" ) return;
      //原先观测的是input的changed事件，但这个事件在ie中很不及时，它要等到input失去焦点才发出来
      button.observe("click", model.onInputClick.bindAsEventListener(model));
      var tr = button.ancestors().find(function(element){
        return Endless.Util.isRecordRow(element);
      })
      tr.observe("click", model.onRowClick.bindAsEventListener(model));
      //别的程序可能会一开始让这些Button被选中
      if( button.checked ) model.select(button.defaultValue);
      button.setAttribute("observed", "true")
    })
  },
  getSelection :function(){
    return this.selection
  },
  onInputClick : function(evt){
    var input = Event.element(evt);
    this.clickInput(input);
  },
  onRowClick : function(evt){
    //点击事件源未必是TR，或者说，一般都不是TR，而是TR中的某个元素，如TD，或者TD里面的元素
    var src = Event.element(evt);
    //点击在input上，就不要再触发事件了，否则两次事件，等于没点
    if( src.hasClassName("selection" ) ) return;
    //所以需要向上寻找TR
    var tr = src.ancestors().find(function(element){
      return Endless.Util.isRecordRow(element);
    })
    if(tr==null){
        return;
    }
    //找到TR之后，再向下找到相应的Input Selection
    var input = tr.select("input.selection").first();
    //找到再模拟人工点击
    if( input != null ) {
      input.checked = !input.checked;
      this.clickInput(input);
    }
  },
  clickInput : function(input){
    var tr = input.ancestors().find(function(element){
      return Endless.Util.isRecordRow(element);
    })
    if( input.checked ){
      this.select(input.defaultValue);
      tr.addClassName("selected")
    }else{
      this.unselect(input.defaultValue);
      tr.removeClassName("selected")
    }
    this.table.page.fire('selectionChanged', this.selection)
  }
})
Endless.MultipleSelectionModel = Class.create(Endless.SelectionModel, {
  /*
   * 选择某个Button的值
   **/
  select : function(value){
    if( !this.selection.include(value) ) this.selection.push(value);
  },
  unselect : function( value ){
    this.selection = this.selection.without(value);
  },
  check : function( inputs ) {
    var selection = [];
    this.selection = selection;
    inputs.each(function(button){
      button.checked = true;
      selection.push(button.defaultValue);
    })
    this.table.page.fire('selectionChanged', this.selection)
  },

  uncheck : function( inputs ) {
    var model = this;
    inputs.each(function(button){
      button.checked = false;
      model.selection = model.selection.without(button.defaultValue);
    })
    this.table.page.fire('selectionChanged', this.selection)
  },
  /**
   * 选择所有
   */
  checkAll : function(){
    this.check(this.table.tbody.select("input.selection"))
  },
  /**
   * 什么都不选
   */
  checkNone : function(){
    var selection = [];
    this.selection = selection;
    this.table.tbody.select("input.selection", "input.group_selection").each(function(button){
      button.checked = false;
    })
    this.table.page.fire('selectionChanged', this.selection)
  }
})
//selection仍然是个数组，不过其中只有一个对象
//因为如果把selection设计为对象的话，当什么都不选的时候，发出的事件中带的Memo会是一个
//系统生成的对象
Endless.SingleSelectionModel = Class.create(Endless.SelectionModel, {
  /*
   * 选择某个Button的值
   **/
  select : function(value){
    this.selection = [value];
  },
  unselect : function( value ){
    if( this.selection.include(value) ) this.selection.length = 0;
  },
  // Not support
  checkNone : function(){
    var button = this.table.tbody.select("input.selection[value=" + this.selection[0] + "]").first();
    if( button ) button.checked = false;
    this.selection.length = 0;
    this.table.page.fire('selectionChanged', this.selection)
  },
  // Not support
  checkAll : function(){},
  clickInput : function(input){
    var tr = input.ancestors().find(function(element){
      return Endless.Util.isRecordRow(element);
    })
    if( input.checked ){
      this.select(input.defaultValue);
      tr.addClassName("selected")
    }else{
      this.unselect(input.defaultValue);
      tr.removeClassName("selected")
    }
    $$("table.scrollable_body tr.row").each(function(tr){
      var field = $$("#" + tr.id+ " input.selection").first();
      field.checked ? tr.addClassName("selected") : tr.removeClassName("selected");
    })
    this.table.page.fire('selectionChanged', this.selection)
  }
})

Endless.NoneSelectionModel = Class.create(Endless.SelectionModel, {
  select : function(){},
  unselect : function(){},
  checkNone: function(){},
  checkAll: function(){}
})

Endless.Toolbar = Class.create({
  initialize: function(page, element) {
    this.page = page;
    this.element = $(element);
    this.buttons = [];
    var toolbar = this;
    this.element.select("td.tool_button button").each(function(td){
      toolbar.buttons.push(new Endless.Button(toolbar, td))
    });
  },

  getButton : function(name){
    return this.buttons.find(function(btn){
      return btn.name == name;
    })
  }
})

Endless.Button = Class.create({
  initialize: function(toolbar, element) {
    this.toolbar = toolbar;
    this.element = $(element);
    this.name = this.element.readAttribute("name");
    this.toolbar.page.hookEventListeners(this);//监听Page的事件
  },
  disabled : function(){
    return this.element.readAttribute("disabled") != null;
  },
  enabled : function(){
    return !this.disabled();
  },

  enable : function(){
    this.element.removeAttribute("disabled");
  },

  disable : function(){
    this.element.setAttribute("disabled","true");
  }
})
//Button的静态方法
//提供CRUD四种按钮的对应选择调节/事件激活逻辑
Object.extend(Endless.Button, {
  adjustForOne : function(source, event){
    var selection = event.memo;
    selection.size() == 1 ? source.enable() : source.disable();
  },
  adjustForMore : function(source, event){
    var selection = event.memo;
    selection.size() >= 1 ? source.enable() : source.disable();
  },
  activate : function(button){
    window.location.href = button.readAttribute("url");
  },
  activateNew : function(button){
    Endless.Button.activate(button);
  },
  activateRefresh : function(button){
    Endless.Page.getInstance().reload();
  },
  activateEdit : function(button){
    var object_id = Endless.Page.getInstance().getSelection()[0].strip();
    window.location.href = button.readAttribute("url").gsub(/:id/,object_id);
  },
  activateAdaptation : function(button){
    var object_id = Endless.Page.getInstance().getSelection()[0].strip();
    window.location.href = button.readAttribute("url").gsub(/:id/,object_id);
  },
  activateBatch:function(button, method){

    var page = Endless.Page.getInstance();
    var object_ids = page.getSelection();
    var urlPattern = button.readAttribute("url");
    var urls = object_ids.collect( function (id){
        return urlPattern.gsub(/:id/,id);
    });
    Page.Tip.clear();
    urls.each(function(url){
        url = encodeURI(url);
        new Ajax.Request(url, {
        asynchronous:false,
        method : method,
        onComplete:function(request){
          Page.Tip.add(request.responseText);
        }
      })
    })
    Page.Tip.show();
    page.reload();
  },
  activateDelete : function(button){
    var page = Endless.Page.getInstance();
    if( page.getSelection().length == 0 ) return;
    var promotion = "您确定要删除被选中的这#{size}条记录".interpolate({
      size : page.getSelection().size()
    });
    if( !confirm( promotion ) ){
      return
    }else{
      Endless.Button.activateBatch(button, 'delete');
    }
  },
  showMore : function(td){
    var ul = $(td).select("ul.more").first();
    if(ul != null) ul.show();
  },
  hideMore : function(ul){
    ul.hide();//.bindAsEventListener(ul).delay(1); //延迟2秒再隐藏
  }
})

Endless.GroupModel = Class.create({
  initialize: function(table){
    this.table = table;
    //分组条，默认为空
    this.groupbars = [];
  },
  hook : function(){
    var model = this;
    this.table.element.select("tr.group").each(function(tr_group){
      if( tr_group.readAttribute("observed" ) == "true" )return;
      model.groupbars.push(new Endless.Groupbar(model.table, tr_group));
      tr_group.setAttribute("observed","true");
    })
  },
  /**
   * 当前的分组
   **/
  currentGroup : function(){
    var bar = this.groupbars.last();
    return bar == null ? null : bar.name;
  },
  clear : function(){
    this.groupbars.length = 0;
  }
})
Endless.Groupbar = Class.create({
  initialize: function(table, element){
    this.table = table;
    this.element = $(element);
    this.nameCell =  this.element.select("td.name").first();
    this.inputControl = this.element.select("td.control input.group_selection").first();
    this.name = this.element.readAttribute("name");
    this.expanded = true;//照理来说，后台可以控制分组内的内容默认是显示还是不显示，而后这里是根据后台的控制结果来决定初始状态
    this.nameCell.observe('click', this.onNameClick.bindAsEventListener(this));
    if( this.inputControl!= null ){
      this.inputControl.observe('click', this.onControlClick.bindAsEventListener(this));
    }
  },
  /**
   * 找到这个Groupbar下面的Row记录，不包括detail信息
   */
  records : function(){
    var result = [];
    var flag = false;//标记是否对以后见到的TR切换显示状态
    var groupbar = this;
    $(this.table.tbody).childElements().each(function(tr){
      if( tr.hasClassName("group") ){
        if( tr.readAttribute("name") == groupbar.name ) {
          flag = true;
        }else if( flag == true ){//在已经切换的情况下，遇到了别的Group，说明本组已经结束
          flag = false;
        }
        return
      }
      if( flag && tr.hasClassName("row") ) result.push(tr);
    })
    return result.compact();
  },
  rows : function(){
    var result = [];
    var flag = false;//标记是否对以后见到的TR切换显示状态
    var groupbar = this;
    $(this.table.tbody).childElements().each(function(tr){
      if( tr.hasClassName("group") ){
        if( tr.readAttribute("name") == groupbar.name ) {
          flag = true;
        }else if( flag == true ){//在已经切换的情况下，遇到了别的Group，说明本组已经结束
          flag = false;
        }
        return
      }
      if( flag ) result.push(tr);
    })
    return result.compact();
  },
  inputs : function(){
    var result = [];
    var flag = false;//标记是否对以后见到的TR切换显示状态
    var groupbar = this;
    $(this.table.tbody).childElements().each(function(tr){
      if( tr.hasClassName("group") ){
        if( tr.readAttribute("name") == groupbar.name ) {
          flag = true;
        }else if( flag == true ){//在已经切换的情况下，遇到了别的Group，说明本组已经结束
          flag = false;
        }
        return
      }
      if( flag && tr.hasClassName("row")) {
        var input = tr.select("td input.selection").first();
        result.push(input);
      }
    })
    return result.compact();
  },
  /**
   * 展开该Groupbar
   */
  expand : function(){
    if( this.expanded )return;
    this.element.addClassName("expanded");
    this.element.removeClassName("shrink");
    this.rows().each(function(row){
      row.show();
    })
    this.expanded = true;
  },
  /**
   * 收缩该Groupbar
   */
  shrink : function(){
    if( !this.expanded )return;
    this.element.removeClassName("expanded");
    this.element.addClassName("shrink");
    this.rows().each(function(row){
      row.hide();
    })
    this.expanded = false;
  },
  onNameClick : function(){
    this.expanded ? this.shrink() : this.expand();
  },
  onControlClick : function(){
    if( this.inputControl.checked ){
      this.table.selectionModel.check(this.inputs());
    }else{
      this.table.selectionModel.uncheck(this.inputs());
    }
  }
})

Endless.Statusbar = Class.create({
  initialize: function(page, element) {
    this.page = page;
    this.element = $(element);
    this.items = [];
    var statusbar = this;
    this.element.select("td.status_item").each(function(li){
      statusbar.items.push(new Endless.StatusItem(statusbar,li));
    })
  }
})

Endless.StatusItem = Class.create({
  initialize: function(statusbar, element) {
    this.statusbar = statusbar;
    this.element = $(element);
    this.statusbar.page.hookEventListeners(this);
  }
})
// StatusItem的静态方法
Object.extend(Endless.StatusItem, {
  updateSelection : function (source, event){
    var selectionModel = source.statusbar.page.table.selectionModel;
    if( selectionModel instanceof Endless.MultipleSelectionModel ){
      var size = event.memo.length;
      source.element.innerHTML = "当前已选择:<b>#{size}</b>条记录".interpolate({
        size : size
      });
    }
  },
  updateSummary : function (source, event){
    source.element.innerHTML = "显示1-#{fetchedSize}条, 总记录数:#{totalEntries}".interpolate(event.memo);
  }
})
Endless.Util = {
  isRecordRow : function(element){
    element = $(element);
    return element.tagName.toLowerCase() == "tr" && element.hasClassName("row");
  }
}
